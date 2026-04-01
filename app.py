"""
Leave Management System — Streamlit + Supabase
Role-based: admin sees everything; user sees only their own data.

Configuration:
  - Secrets  → .env file          (SUPABASE_URL, SUPABASE_KEY, SENDER_EMAIL, SENDER_PASSWORD)
  - App config → config.json      (leave types, roles, default email, app name)
"""

import os
import json
import streamlit as st
from supabase import create_client, Client
import bcrypt
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import date, datetime, timedelta
import calendar as cal_lib
from dotenv import load_dotenv

# ──────────────────────────────────────────────
#  Load environment variables from .env
# ──────────────────────────────────────────────
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "")
SENDER_PASS  = os.environ.get("SENDER_PASSWORD", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    st.error("Missing SUPABASE_URL or SUPABASE_KEY. Please check your .env file.")
    st.stop()

# ──────────────────────────────────────────────
#  Load app config from config.json
# ──────────────────────────────────────────────
_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
with open(_CONFIG_PATH, "r", encoding="utf-8") as _f:
    _APP_CFG = json.load(_f)

APP_NAME      = _APP_CFG.get("app_name", "Leave Management System")
APP_ICON      = _APP_CFG.get("app_icon", "🗓️")
DEFAULT_EMAIL = _APP_CFG.get("default_email", "")
ROLES         = _APP_CFG.get("roles", [])

# Build LEAVE_TYPES as dict of  key → (label, color)  from config.json
LEAVE_TYPES = {
    k: (v["label"], v["color"])
    for k, v in _APP_CFG.get("leave_types", {}).items()
}

# ──────────────────────────────────────────────
#  Supabase Client
# ──────────────────────────────────────────────
@st.cache_resource
def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

sb = get_supabase()

# ──────────────────────────────────────────────
#  Email Helper
# ──────────────────────────────────────────────
def send_email(to_email: str, subject: str, html_body: str) -> bool:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = SENDER_EMAIL
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as srv:
            srv.login(SENDER_EMAIL, SENDER_PASS)
            srv.sendmail(SENDER_EMAIL, to_email, msg.as_string())
        return True
    except Exception as e:
        st.warning(f"Email could not be sent: {e}")
        return False

def notify(to_email: str, subject: str, body_lines: list):
    rows = "".join(f"<p style='margin:4px 0'>{l}</p>" for l in body_lines if l)
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;
                border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <div style="background:#3B82F6;padding:16px 24px">
        <h2 style="color:white;margin:0">Leave Management System</h2>
      </div>
      <div style="padding:24px">{rows}</div>
      <div style="background:#f9fafb;padding:10px 24px;font-size:12px;color:#6b7280">
        Automated notification — please do not reply.
      </div>
    </div>"""
    send_email(to_email, subject, html)

# ──────────────────────────────────────────────
#  Auth Helpers
# ──────────────────────────────────────────────
def hash_password(pwd: str) -> str:
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()

def check_password(pwd: str, hashed: str) -> bool:
    return bcrypt.checkpw(pwd.encode(), hashed.encode())

def is_admin() -> bool:
    return st.session_state.get("user", {}).get("role") == "admin"

def current_emp_id():
    return st.session_state.get("user", {}).get("emp_id")

# ──────────────────────────────────────────────
#  Supabase Data Helpers
# ──────────────────────────────────────────────
def get_user(username: str):
    r = sb.table("users").select("*").eq("username", username).execute()
    return r.data[0] if r.data else None

def get_employees():
    return sb.table("employees").select("*").order("name").execute().data

def get_employee(emp_id: int):
    if not emp_id:
        return None
    r = sb.table("employees").select("*").eq("id", emp_id).execute()
    return r.data[0] if r.data else None

def get_requests(emp_id=None):
    q = sb.table("leave_requests").select("*").order("created_at", desc=True)
    if emp_id:
        q = q.eq("emp_id", emp_id)
    return q.execute().data

def get_approved_leaves(emp_id=None):
    q = sb.table("approved_leaves").select("*")
    if emp_id:
        q = q.eq("emp_id", emp_id)
    return q.execute().data

def get_comp_requests(emp_id=None):
    q = sb.table("comp_requests").select("*").order("created_at", desc=True)
    if emp_id:
        q = q.eq("emp_id", emp_id)
    return q.execute().data

def get_holidays():
    return sb.table("public_holidays").select("*").order("date_str").execute().data

def get_config() -> dict:
    rows = sb.table("system_config").select("*").execute().data
    return {r["key"]: r["value"] for r in rows}

def set_config(key: str, value: str):
    sb.table("system_config").upsert({"key": key, "value": str(value)}).execute()

# ──────────────────────────────────────────────
#  Leave Balance Engine
# ──────────────────────────────────────────────
def calculate_leave_days(start, end, leave_type, is_half, holidays, sandwich):
    if not start:
        return 0
    if is_half:
        return 0.5
    if not end:
        end = start
    s = date.fromisoformat(str(start)[:10])
    e = date.fromisoformat(str(end)[:10])
    if s > e:
        return 0
    holiday_set = {str(h["date_str"])[:10] for h in holidays}
    apply_sw = (leave_type == "CL" and sandwich)
    days = 0
    cur = s
    while cur <= e:
        ds = cur.isoformat()
        if ds not in holiday_set and (cur.weekday() < 5 or apply_sw):
            days += 1
        cur += timedelta(days=1)
    return days


def get_emp_balances(emp, sys_date_str, cfg, requests, approved, holidays):
    try:
        sys_d = date.fromisoformat(sys_date_str[:10])
    except Exception:
        sys_d = date.today()

    active_year = int(cfg.get("active_leave_year", sys_d.year))
    rate        = float(cfg.get("pl_accrual_days_worked_rate", 20))
    cl_sl_total = float(cfg.get("cl_sl_total_per_year", 14))
    eoy         = date(active_year, 12, 31)
    calc_end    = min(sys_d, eoy)
    holiday_set = {str(h["date_str"])[:10] for h in holidays}

    emp_leaves: dict = {}

    def _add(lst):
        for l in lst:
            if l.get("emp_id") != emp["id"] or l.get("stage") == "Rejected":
                continue
            sd = str(l.get("start_date") or l.get("date_str") or "")[:10]
            ed = str(l.get("end_date")   or l.get("date_str") or sd)[:10]
            if not sd:
                continue
            val = 0.5 if l.get("is_half_day") else 1.0
            cur = date.fromisoformat(sd)
            end = date.fromisoformat(ed)
            while cur <= end:
                emp_leaves[cur.isoformat()] = val
                cur += timedelta(days=1)

    _add(approved)
    _add(requests)

    ytd = eoy_w = 0.0
    cur = date(active_year, 1, 1)
    while cur <= eoy:
        ds = cur.isoformat()
        if cur.weekday() < 5 and ds not in holiday_set:
            dwv = 1.0 - emp_leaves.get(ds, 0.0)
            if cur <= calc_end:
                ytd += dwv
            eoy_w += dwv
        cur += timedelta(days=1)

    adj_pl   = float(emp.get("pl_adjustment", 0))
    acc_pl   = ytd   / rate + adj_pl
    eoy_pl   = eoy_w / rate + adj_pl
    month    = min(12, sys_d.month)
    acc_clsl = month * cl_sl_total / 12 + float(emp.get("cl_sl_adjustment", 0))

    pl_bf   = float(emp.get("pl_brought_forward", 0))
    pl_used = float(emp.get("pl_used", 0))
    cs_used = float(emp.get("cl_sl_used", 0))
    co_tot  = float(emp.get("comp_total", 0))
    co_used = float(emp.get("comp_used", 0))

    return {
        "ytd_worked": round(ytd, 1),
        "eoy_worked": round(eoy_w, 1),
        "PL":    {"brought_forward": pl_bf, "accrued": round(acc_pl, 2),
                  "used": pl_used, "net": round(pl_bf + acc_pl - pl_used, 2),
                  "eoy_accrued": round(eoy_pl, 2)},
        "CL_SL": {"accrued": round(acc_clsl, 2), "used": cs_used,
                  "net": round(acc_clsl - cs_used, 2)},
        "COMP":  {"accrued": co_tot, "used": co_used, "net": co_tot - co_used},
    }

# ──────────────────────────────────────────────
#  Session State
# ──────────────────────────────────────────────
def init_state():
    for k, v in {"logged_in": False, "user": None, "page": "login", "tab": None}.items():
        if k not in st.session_state:
            st.session_state[k] = v

# ──────────────────────────────────────────────
#  LOGIN PAGE
# ──────────────────────────────────────────────
def login_page():
    _, col, _ = st.columns([1, 2, 1])
    with col:
        st.markdown("## Leave Portal")
        st.markdown("Sign in to access your dashboard")
        st.markdown("---")
        with st.form("login_form"):
            username  = st.text_input("Username")
            password  = st.text_input("Password", type="password")
            submitted = st.form_submit_button("Sign In", use_container_width=True)

        if submitted:
            if not username or not password:
                st.error("Please enter username and password.")
                return
            user = get_user(username)
            if not user:
                st.error("User not found.")
                return
            if not check_password(password, user["password_hash"]):
                st.error("Invalid password.")
                return
            st.session_state.logged_in = True
            st.session_state.user      = user
            st.session_state.tab = "dashboard" if user.get("role") == "admin" else "my_portal"
            notify(user["email"], "LMS: Login Notification", [
                f"<b>Hi {username},</b>",
                f"You logged in at {datetime.now().strftime('%d %b %Y %H:%M')}.",
            ])
            st.rerun()

        st.markdown("---")
        st.caption("Don't have an account?")
        if st.button("Register new account", use_container_width=True):
            st.session_state.page = "register"
            st.rerun()

# ──────────────────────────────────────────────
#  REGISTER PAGE
# ──────────────────────────────────────────────
def register_page():
    _, col, _ = st.columns([1, 2, 1])
    with col:
        st.markdown("## Register")
        st.markdown("---")
        emps        = get_employees()
        emp_options = ["— Select your employee profile —"] + [e["name"] for e in emps]

        with st.form("reg_form"):
            username  = st.text_input("Username")
            password  = st.text_input("Password", type="password")
            confirm   = st.text_input("Confirm Password", type="password")
            email     = st.text_input("Email", value=DEFAULT_EMAIL)
            emp_sel   = st.selectbox("Your Employee Profile", emp_options)
            submitted = st.form_submit_button("Register", use_container_width=True)

        if submitted:
            if not username or not password:
                st.error("Username and password are required.")
                return
            if password != confirm:
                st.error("Passwords do not match.")
                return
            if len(password) < 6:
                st.error("Password must be at least 6 characters.")
                return
            if get_user(username):
                st.error("Username already exists.")
                return
            sel_emp = next((e for e in emps if e["name"] == emp_sel), None)
            sb.table("users").insert({
                "username":      username,
                "password_hash": hash_password(password),
                "email":         email,
                "role":          "user",
                "emp_id":        sel_emp["id"] if sel_emp else None,
            }).execute()
            notify(email, "LMS: Welcome!", [
                f"<b>Welcome {username}!</b>",
                "Your account has been created.",
                f"Employee profile: {sel_emp['name'] if sel_emp else 'Not linked'}",
            ])
            st.success("Registered! You can now log in.")
            st.session_state.page = "login"
            st.rerun()

        if st.button("Back to Login", use_container_width=True):
            st.session_state.page = "login"
            st.rerun()

# ──────────────────────────────────────────────
#  SIDEBAR — Role-based menu
# ──────────────────────────────────────────────
ADMIN_TABS = {
    "dashboard": "📊 Dashboard",
    "calendar":  "📅 Calendar",
    "pending":   "⏳ Pending Requests",
    "comp_off":  "🔄 Comp Off",
    "reports":   "📋 Reports",
    "employees": "👥 Employees",
    "settings":  "⚙️ Settings",
    "profile":   "👤 My Profile",
}

USER_TABS = {
    "my_portal": "🏠 My Portal",
    "calendar":  "📅 Team Calendar",
    "comp_off":  "🔄 Request Comp Off",
    "profile":   "👤 My Profile",
}


def sidebar():
    user = st.session_state.user
    role = user.get("role", "user")
    tabs = ADMIN_TABS if role == "admin" else USER_TABS

    with st.sidebar:
        badge = "🔴 Admin" if role == "admin" else "🟢 User"
        st.markdown(f"### {user['username']}")
        st.caption(f"{badge}  ·  {user['email']}")
        st.markdown("---")

        for key, label in tabs.items():
            btn_type = "primary" if st.session_state.tab == key else "secondary"
            if st.button(label, use_container_width=True,
                         type=btn_type, key=f"nav_{key}"):
                st.session_state.tab = key
                st.rerun()

        st.markdown("---")
        if st.button("Logout", use_container_width=True):
            st.session_state.logged_in = False
            st.session_state.user      = None
            st.session_state.tab       = None
            st.rerun()

# ──────────────────────────────────────────────
#  ADMIN: DASHBOARD
# ──────────────────────────────────────────────
def tab_dashboard():
    st.title("📊 Admin Dashboard")
    cfg      = get_config()
    emps     = get_employees()
    requests = get_requests()
    approved = get_approved_leaves()
    holidays = get_holidays()
    sys_date = cfg.get("system_date", date.today().isoformat())
    act_year = cfg.get("active_leave_year", str(date.today().year))

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Total Employees",  len(emps))
    c2.metric("Pending Requests", len(requests))
    c3.metric("Employees on Leave Today",
              len({a["emp_id"] for a in approved
                   if str(a["date_str"])[:10] == date.today().isoformat()}))
    c4.metric("Active Leave Year", act_year)

    st.markdown("---")
    st.subheader("Leave Balance Summary")
    import pandas as pd
    rows = []
    for emp in emps:
        b = get_emp_balances(emp, sys_date, cfg, requests, approved, holidays)
        rows.append({
            "Employee":  emp["name"],
            "Role":      emp["role"],
            "PL Net":    b["PL"]["net"],
            "CL/SL Net": b["CL_SL"]["net"],
            "COMP Net":  b["COMP"]["net"],
        })
    if rows:
        st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

    if requests:
        st.markdown("---")
        st.subheader("Recent Pending Requests")
        for r in requests[:5]:
            col1, col2, col3 = st.columns([4, 3, 2])
            col1.write(f"**{r['emp_name']}** — "
                       f"{LEAVE_TYPES.get(r['leave_type'], (r['leave_type'],))[0]}")
            col2.write(f"{str(r['start_date'])[:10]} → {str(r['end_date'])[:10]}")
            col3.markdown(f"`{r['stage']}`")
        if len(requests) > 5:
            st.caption(f"...and {len(requests)-5} more. Go to Pending Requests.")

# ──────────────────────────────────────────────
#  USER: MY PORTAL
# ──────────────────────────────────────────────
def tab_my_portal():
    st.title("🏠 My Portal")
    user     = st.session_state.user
    emp_id   = current_emp_id()
    cfg      = get_config()
    holidays = get_holidays()
    emp      = get_employee(emp_id)

    if not emp:
        st.warning("Your account is not linked to an employee profile. "
                   "Go to My Profile to link it, or ask your admin.")
        return

    my_requests = get_requests(emp_id=emp_id)
    my_approved = get_approved_leaves(emp_id=emp_id)
    bals = get_emp_balances(
        emp, cfg.get("system_date", date.today().isoformat()),
        cfg, my_requests, my_approved, holidays
    )

    st.subheader(f"My Leave Balances — {emp['name']}")
    c1, c2, c3 = st.columns(3)
    c1.metric("Privilege Leave",
              f"{bals['PL']['net']:.1f} days",
              f"Accrued: {bals['PL']['accrued']:.1f}")
    c2.metric("Casual / Sick",
              f"{bals['CL_SL']['net']:.1f} days",
              f"Used: {bals['CL_SL']['used']:.0f}")
    c3.metric("Comp Off",
              f"{bals['COMP']['net']:.0f} days",
              f"Earned: {bals['COMP']['accrued']:.0f}")

    st.markdown("---")
    st.subheader("Apply for Leave")
    with st.form("apply_leave_form"):
        col1, col2 = st.columns(2)
        with col1:
            leave_type = st.selectbox("Leave Type", list(LEAVE_TYPES.keys()),
                                      format_func=lambda k: LEAVE_TYPES[k][0])
            start_dt   = st.date_input("Start Date", value=date.today())
            is_half    = st.checkbox("Half Day")
        with col2:
            half_type = st.selectbox("Half Type", ["First Half", "Second Half"],
                                     disabled=not is_half)
            end_dt    = st.date_input("End Date", value=date.today(),
                                      disabled=is_half)
            reason    = st.text_area("Reason", height=95)
        submitted = st.form_submit_button("Submit Leave Request",
                                          use_container_width=True)

    if submitted:
        days = calculate_leave_days(
            start_dt.isoformat(),
            (start_dt if is_half else end_dt).isoformat(),
            leave_type, is_half, holidays,
            cfg.get("sandwich_rule", "true") == "true",
        )
        if days == 0:
            st.error("No working days in the selected range.")
        else:
            auto = (leave_type == "SL"
                    and cfg.get("auto_approve_sick_leave", "true") == "true"
                    and days <= 2)
            req = {
                "emp_id": emp["id"], "emp_name": emp["name"],
                "start_date": start_dt.isoformat(),
                "end_date":   (start_dt if is_half else end_dt).isoformat(),
                "leave_type": leave_type, "days": days,
                "is_half_day": is_half,
                "half_type":   half_type if is_half else None,
                "reason": reason,
                "stage": "Approved" if auto else "Manager Review",
            }
            if auto:
                _insert_approved_days(req, holidays,
                                      cfg.get("sandwich_rule", "true") == "true")
                _update_balance(emp, leave_type, days)
                st.success("Sick leave auto-approved.")
            else:
                sb.table("leave_requests").insert(req).execute()
                st.success(f"Leave request submitted ({days} day(s)) — Pending approval.")

            notify(user["email"], "LMS: Leave Request Submitted", [
                f"<b>Leave Request Submitted</b>",
                f"Type: {LEAVE_TYPES[leave_type][0]}",
                f"Dates: {start_dt} to {(start_dt if is_half else end_dt)}",
                f"Days: {days}",
                f"Status: {'Auto-Approved' if auto else 'Pending Manager Review'}",
            ])
            st.rerun()

    if my_requests:
        st.markdown("---")
        st.subheader("My Pending Requests")
        for r in my_requests:
            c1, c2, c3, c4 = st.columns([3, 3, 2, 1])
            c1.write(f"**{LEAVE_TYPES.get(r['leave_type'],(r['leave_type'],))[0]}**")
            c2.write(f"{str(r['start_date'])[:10]} → {str(r['end_date'])[:10]}")
            c3.markdown(f"`{r['stage']}`  {r['days']} day(s)")
            if c4.button("Cancel", key=f"cancel_{r['id']}"):
                sb.table("leave_requests").delete().eq("id", r["id"]).execute()
                st.rerun()

    if my_approved:
        st.markdown("---")
        st.subheader("My Approved Leave History")
        dates = sorted({str(a["date_str"])[:10] for a in my_approved}, reverse=True)
        for ds in dates[:30]:
            a   = next(x for x in my_approved if str(x["date_str"])[:10] == ds)
            lt  = LEAVE_TYPES.get(a["leave_type"], (a["leave_type"],))[0]
            sfx = "  (Half Day)" if a.get("is_half_day") else ""
            st.write(f"• {ds}  —  {lt}{sfx}")

# ──────────────────────────────────────────────
#  CALENDAR (shared; filtered by role)
# ──────────────────────────────────────────────
def tab_calendar():
    st.title("📅 Team Calendar" if is_admin() else "📅 My Calendar")
    cfg      = get_config()
    holidays = get_holidays()
    emps     = get_employees()
    approved = (get_approved_leaves() if is_admin()
                else get_approved_leaves(emp_id=current_emp_id()))

    sys_date = date.fromisoformat(
        cfg.get("system_date", date.today().isoformat()))
    if "cal_year"  not in st.session_state:
        st.session_state.cal_year  = sys_date.year
    if "cal_month" not in st.session_state:
        st.session_state.cal_month = sys_date.month

    nav1, nav2, nav3 = st.columns([1, 3, 1])
    with nav1:
        if st.button("Prev"):
            m, y = st.session_state.cal_month - 1, st.session_state.cal_year
            if m < 1: m, y = 12, y - 1
            st.session_state.cal_month, st.session_state.cal_year = m, y
            st.rerun()
    with nav2:
        label = date(st.session_state.cal_year,
                     st.session_state.cal_month, 1).strftime("%B %Y")
        st.markdown(f"<h3 style='text-align:center'>{label}</h3>",
                    unsafe_allow_html=True)
    with nav3:
        if st.button("Next"):
            m, y = st.session_state.cal_month + 1, st.session_state.cal_year
            if m > 12: m, y = 1, y + 1
            st.session_state.cal_month, st.session_state.cal_year = m, y
            st.rerun()

    y, m = st.session_state.cal_year, st.session_state.cal_month

    if is_admin():
        f1, f2 = st.columns(2)
        emp_filter  = f1.selectbox("Employee",   ["All"] + [e["name"] for e in emps])
        type_filter = f2.selectbox("Leave Type", ["All"] + list(LEAVE_TYPES.keys()))
    else:
        type_filter = st.selectbox("Leave Type", ["All"] + list(LEAVE_TYPES.keys()))
        emp_filter  = "All"

    holiday_set  = {str(h["date_str"])[:10]: h["name"] for h in holidays}
    approved_map: dict = {}
    for a in approved:
        ds = str(a["date_str"])[:10]
        approved_map.setdefault(ds, []).append(a)

    days_in_month = cal_lib.monthrange(y, m)[1]
    first_wday    = date(y, m, 1).weekday()

    hdr = st.columns(7)
    for i, d_name in enumerate(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]):
        hdr[i].markdown(f"**{d_name}**")

    day_num = 1
    blanks  = first_wday
    while day_num <= days_in_month:
        row = st.columns(7)
        for ci in range(7):
            if blanks > 0:
                blanks -= 1
                continue
            if day_num > days_in_month:
                break
            ds   = date(y, m, day_num).isoformat()
            cell = f"**{day_num}**"
            if ds in holiday_set:
                cell += f"\n🏖️ {holiday_set[ds]}"
            today_leaves = approved_map.get(ds, [])
            if emp_filter  != "All":
                today_leaves = [l for l in today_leaves if l["emp_name"]  == emp_filter]
            if type_filter != "All":
                today_leaves = [l for l in today_leaves if l["leave_type"] == type_filter]
            for l in today_leaves:
                color = LEAVE_TYPES.get(l["leave_type"], ("", "#6b7280"))[1]
                half  = " ½" if l.get("is_half_day") else ""
                name  = l["emp_name"] if is_admin() else "Me"
                cell += (f"\n<span style='color:{color};font-size:11px'>"
                         f"● {name}{half}</span>")
            row[ci].markdown(cell, unsafe_allow_html=True)
            day_num += 1

    st.markdown("---")
    leg = st.columns(len(LEAVE_TYPES))
    for i, (k, (lbl, clr)) in enumerate(LEAVE_TYPES.items()):
        leg[i].markdown(f"<span style='color:{clr}'>■</span> {lbl}",
                        unsafe_allow_html=True)

# ──────────────────────────────────────────────
#  ADMIN: PENDING REQUESTS
# ──────────────────────────────────────────────
def tab_pending():
    st.title("⏳ Pending Leave Requests")
    requests   = get_requests()
    holidays   = get_holidays()
    emps       = get_employees()
    cfg        = get_config()
    user_email = st.session_state.user.get("email", "sandeepjain200019@gmail.com")

    type_filter = st.selectbox("Filter by Type",
                               ["All"] + list(LEAVE_TYPES.keys()))
    filtered    = [r for r in requests
                   if type_filter == "All" or r["leave_type"] == type_filter]

    if not filtered:
        st.info("No pending requests.")
        return

    if st.button("Bulk Approve All Visible", type="primary"):
        for r in filtered:
            _approve_request(r, emps, holidays, cfg, user_email)
        st.success("All visible requests approved.")
        st.rerun()

    st.markdown("---")
    for r in filtered:
        lt_label = LEAVE_TYPES.get(r["leave_type"], (r["leave_type"],))[0]
        header   = (f"#{r['id']}  {r['emp_name']} — {lt_label}  "
                    f"({str(r['start_date'])[:10]} → {str(r['end_date'])[:10]})  "
                    f"[{r['days']} day(s)]  |  {r['stage']}")
        with st.expander(header):
            st.write(f"**Reason:** {r.get('reason', '—')}")
            if r.get("is_half_day"):
                st.write(f"**Half Day:** {r.get('half_type', '')}")
            a1, a2, a3 = st.columns(3)
            if a1.button("Approve", key=f"app_{r['id']}"):
                _approve_request(r, emps, holidays, cfg, user_email)
                st.rerun()
            if a2.button("Reject",  key=f"rej_{r['id']}"):
                sb.table("leave_requests").delete().eq("id", r["id"]).execute()
                notify(user_email, "LMS: Leave Request Rejected", [
                    f"<b>Leave request rejected</b>",
                    f"Employee: {r['emp_name']}",
                    f"Type: {lt_label}",
                    f"Dates: {str(r['start_date'])[:10]} → {str(r['end_date'])[:10]}",
                ])
                st.rerun()
            if a3.button("Send Reminder", key=f"rem_{r['id']}"):
                notify(user_email, "LMS: Approval Reminder", [
                    f"Reminder: Request #{r['id']} from {r['emp_name']} awaits approval.",
                ])
                st.success("Reminder sent.")


def _approve_request(r, emps, holidays, cfg, user_email):
    sandwich = cfg.get("sandwich_rule", "true") == "true"
    _insert_approved_days(r, holidays, sandwich)
    emp = next((e for e in emps if e["id"] == r["emp_id"]), None)
    if emp:
        _update_balance(emp, r["leave_type"], float(r["days"]))
    sb.table("leave_requests").delete().eq("id", r["id"]).execute()
    lt_label = LEAVE_TYPES.get(r["leave_type"], (r["leave_type"],))[0]
    notify(user_email, "LMS: Leave Approved", [
        f"<b>Leave Approved</b>",
        f"Employee: {r['emp_name']}",
        f"Type: {lt_label}",
        f"Dates: {str(r['start_date'])[:10]} → {str(r['end_date'])[:10]}",
        f"Days: {r['days']}",
    ])


def _insert_approved_days(req, holidays, sandwich):
    holiday_set = {str(h["date_str"])[:10] for h in holidays}
    apply_sw    = req["leave_type"] == "CL" and sandwich
    cur = date.fromisoformat(str(req["start_date"])[:10])
    end = date.fromisoformat(str(req["end_date"])[:10])
    while cur <= end:
        ds = cur.isoformat()
        if ds not in holiday_set and (cur.weekday() < 5 or apply_sw):
            sb.table("approved_leaves").insert({
                "emp_id":      req["emp_id"],
                "emp_name":    req["emp_name"],
                "date_str":    ds,
                "leave_type":  req["leave_type"],
                "is_half_day": req.get("is_half_day", False),
                "half_type":   req.get("half_type"),
                "days":        0.5 if req.get("is_half_day") else 1.0,
                "reason":      req.get("reason"),
            }).execute()
        cur += timedelta(days=1)


def _update_balance(emp, leave_type, days):
    col = ("cl_sl_used" if leave_type in ("CL", "SL")
           else "pl_used"   if leave_type == "PL"
           else "comp_used" if leave_type == "COMP"
           else None)
    if col:
        new_val = float(emp.get(col, 0)) + days
        sb.table("employees").update({col: new_val}).eq("id", emp["id"]).execute()

# ──────────────────────────────────────────────
#  COMP OFF TAB
# ──────────────────────────────────────────────
def tab_comp_off():
    title = "🔄 Comp Off Management" if is_admin() else "🔄 Request Comp Off"
    st.title(title)
    emps       = get_employees()
    user_email = st.session_state.user.get("email", "sandeepjain200019@gmail.com")
    emp_id     = current_emp_id()

    st.subheader("Log Extra Work")
    with st.form("comp_form"):
        c1, c2 = st.columns(2)
        with c1:
            if is_admin():
                emp_names = [e["name"] for e in emps]
                sel_name  = st.selectbox("Employee", emp_names)
            else:
                my_emp   = get_employee(emp_id)
                sel_name = my_emp["name"] if my_emp else ""
                st.info(f"Logging for: **{sel_name}**")
            work_date = st.date_input("Date of Extra Work", value=date.today())
        with c2:
            days   = st.number_input("Days", min_value=0.5, max_value=3.0,
                                     value=1.0, step=0.5)
            reason = st.text_area("Reason", height=80)
        submitted = st.form_submit_button("Submit Request", use_container_width=True)

    if submitted:
        sel_emp = next((e for e in emps if e["name"] == sel_name), None)
        if not sel_emp:
            st.error("Employee not found.")
        else:
            sb.table("comp_requests").insert({
                "emp_id":   sel_emp["id"],
                "emp_name": sel_emp["name"],
                "date_str": work_date.isoformat(),
                "days":     days,
                "reason":   reason,
            }).execute()
            notify(user_email, "LMS: Comp Off Request Submitted", [
                f"<b>Comp Off Request</b>",
                f"Employee: {sel_emp['name']}",
                f"Date: {work_date}  |  Days: {days}",
            ])
            st.success("Comp off request submitted.")
            st.rerun()

    # Admin: see all pending comp off requests to approve
    if is_admin():
        st.markdown("---")
        st.subheader("Pending Comp Off Requests")
        comp_reqs = get_comp_requests()
        if not comp_reqs:
            st.info("No pending comp off requests.")
        else:
            for r in comp_reqs:
                with st.expander(
                    f"{r['emp_name']} — {str(r['date_str'])[:10]}  ({r['days']} day(s))"
                ):
                    st.write(f"**Reason:** {r.get('reason', '—')}")
                    b1, b2 = st.columns(2)
                    if b1.button("Approve", key=f"ca_{r['id']}"):
                        emp = next((e for e in emps if e["id"] == r["emp_id"]), None)
                        if emp:
                            new_tot = float(emp.get("comp_total", 0)) + float(r["days"])
                            sb.table("employees").update(
                                {"comp_total": new_tot}).eq("id", emp["id"]).execute()
                        sb.table("comp_requests").delete().eq("id", r["id"]).execute()
                        notify(user_email, "LMS: Comp Off Approved", [
                            f"<b>Comp Off Approved</b>",
                            f"Employee: {r['emp_name']}",
                            f"Date: {str(r['date_str'])[:10]}  |  Days: {r['days']}",
                        ])
                        st.rerun()
                    if b2.button("Reject", key=f"cr_{r['id']}"):
                        sb.table("comp_requests").delete().eq("id", r["id"]).execute()
                        st.rerun()
    else:
        # User: view their own pending comp off
        st.markdown("---")
        st.subheader("My Comp Off Requests")
        my_comp = get_comp_requests(emp_id=emp_id)
        if not my_comp:
            st.info("No pending comp off requests.")
        else:
            for r in my_comp:
                st.write(f"• {str(r['date_str'])[:10]}  —  {r['days']} day(s)"
                         f"  —  Pending  —  {r.get('reason','')}")

# ──────────────────────────────────────────────
#  ADMIN: REPORTS
# ──────────────────────────────────────────────
def tab_reports():
    st.title("📋 Leave Reports")
    cfg      = get_config()
    holidays = get_holidays()
    requests = get_requests()
    approved = get_approved_leaves()
    emps     = get_employees()
    sys_date = cfg.get("system_date", date.today().isoformat())

    rtype = st.radio("View", ["PL Balances", "CL/SL Balances",
                              "COMP Balances", "Full Summary"], horizontal=True)
    import pandas as pd
    rows = []
    for emp in emps:
        b = get_emp_balances(emp, sys_date, cfg, requests, approved, holidays)
        rows.append({
            "Employee":      emp["name"],
            "Role":          emp["role"],
            "PL BF":         b["PL"]["brought_forward"],
            "PL Accrued":    b["PL"]["accrued"],
            "PL Used":       b["PL"]["used"],
            "PL Net":        b["PL"]["net"],
            "CL/SL Accrued": b["CL_SL"]["accrued"],
            "CL/SL Used":    b["CL_SL"]["used"],
            "CL/SL Net":     b["CL_SL"]["net"],
            "COMP Total":    b["COMP"]["accrued"],
            "COMP Used":     b["COMP"]["used"],
            "COMP Net":      b["COMP"]["net"],
        })
    if not rows:
        st.info("No data.")
        return
    df = pd.DataFrame(rows)
    if   rtype == "PL Balances":
        st.dataframe(df[["Employee","Role","PL BF","PL Accrued","PL Used","PL Net"]],
                     use_container_width=True, hide_index=True)
    elif rtype == "CL/SL Balances":
        st.dataframe(df[["Employee","Role","CL/SL Accrued","CL/SL Used","CL/SL Net"]],
                     use_container_width=True, hide_index=True)
    elif rtype == "COMP Balances":
        st.dataframe(df[["Employee","Role","COMP Total","COMP Used","COMP Net"]],
                     use_container_width=True, hide_index=True)
    else:
        st.dataframe(df, use_container_width=True, hide_index=True)

    st.markdown("---")
    st.subheader("Approved Leave Log")
    tf = st.selectbox("Filter Type",     ["All"] + list(LEAVE_TYPES.keys()))
    ef = st.selectbox("Filter Employee", ["All"] + [e["name"] for e in emps])
    filt = approved
    if tf != "All": filt = [a for a in filt if a["leave_type"] == tf]
    if ef != "All": filt = [a for a in filt if a["emp_name"]   == ef]
    if filt:
        df2 = pd.DataFrame(filt)[["emp_name","date_str","leave_type","days","reason"]]
        df2.columns = ["Employee","Date","Type","Days","Reason"]
        st.dataframe(df2.sort_values("Date", ascending=False),
                     use_container_width=True, hide_index=True)
    else:
        st.info("No records found.")

# ──────────────────────────────────────────────
#  ADMIN: EMPLOYEES
# ──────────────────────────────────────────────
def tab_employees():
    st.title("👥 Employee Management")
    emps = get_employees()
    c1, c2 = st.columns([3, 1])
    search = c1.text_input("Search", placeholder="Name or role")
    if c2.button("Add Employee", use_container_width=True):
        st.session_state.show_add_emp = True

    if st.session_state.get("show_add_emp"):
        with st.form("add_emp_form"):
            st.subheader("Add New Employee")
            name  = st.text_input("Full Name")
            role  = st.selectbox("Role", ROLES)
            pl_bf = st.number_input("PL Brought Forward", min_value=0.0, value=0.0)
            if st.form_submit_button("Add Employee"):
                if name.strip():
                    sb.table("employees").insert({
                        "name": name.strip(), "role": role,
                        "pl_brought_forward": pl_bf,
                        "pl_used": 0, "cl_sl_used": 0,
                        "comp_total": 0, "comp_used": 0,
                    }).execute()
                    st.session_state.show_add_emp = False
                    st.success(f"'{name}' added.")
                    st.rerun()
                else:
                    st.error("Name is required.")

    filt = [e for e in emps
            if not search
            or search.lower() in e["name"].lower()
            or search.lower() in e["role"].lower()]

    st.markdown(f"**{len(filt)} employee(s)**")
    for emp in filt:
        with st.expander(f"{emp['name']}  —  {emp['role']}"):
            c1, c2, c3 = st.columns(3)
            c1.metric("PL BF",      emp.get("pl_brought_forward", 0))
            c2.metric("PL Used",    emp.get("pl_used", 0))
            c3.metric("CL/SL Used", emp.get("cl_sl_used", 0))
            with st.form(f"edit_{emp['id']}"):
                nr   = st.selectbox("Role", ROLES,
                                    index=ROLES.index(emp["role"])
                                    if emp["role"] in ROLES else 0)
                nbf  = st.number_input("PL BF",         value=float(emp.get("pl_brought_forward",0)), key=f"bf_{emp['id']}")
                nadj = st.number_input("PL Adjustment",  value=float(emp.get("pl_adjustment",0)),      key=f"aj_{emp['id']}")
                csaj = st.number_input("CL/SL Adjust",  value=float(emp.get("cl_sl_adjustment",0)),   key=f"ca_{emp['id']}")
                ctot = st.number_input("COMP Total",      value=float(emp.get("comp_total",0)),         key=f"ct_{emp['id']}")
                if st.form_submit_button("Save"):
                    sb.table("employees").update({
                        "role": nr, "pl_brought_forward": nbf,
                        "pl_adjustment": nadj, "cl_sl_adjustment": csaj,
                        "comp_total": ctot,
                    }).eq("id", emp["id"]).execute()
                    st.success("Saved.")
                    st.rerun()
            if st.button("Remove Employee", key=f"del_{emp['id']}"):
                sb.table("employees").delete().eq("id", emp["id"]).execute()
                st.warning(f"{emp['name']} removed.")
                st.rerun()

# ──────────────────────────────────────────────
#  ADMIN: SETTINGS
# ──────────────────────────────────────────────
def tab_settings():
    st.title("⚙️ System Settings")
    cfg        = get_config()
    holidays   = get_holidays()
    user_email = st.session_state.user.get("email", "sandeepjain200019@gmail.com")

    c1, c2 = st.columns(2)
    with c1:
        st.subheader("System Date")
        sd = st.date_input(
            "Current System Date",
            value=date.fromisoformat(cfg.get("system_date", date.today().isoformat())))
        if st.button("Update Date"):
            set_config("system_date", sd.isoformat())
            st.success(f"Updated to {sd}.")
    with c2:
        st.subheader("Active Leave Year")
        ay = st.number_input("Year", value=int(cfg.get("active_leave_year", date.today().year)),
                             min_value=2020, max_value=2035)
        if st.button("Update Year"):
            set_config("active_leave_year", str(ay))
            st.success(f"Active year set to {ay}.")

    st.markdown("---")
    st.subheader("Leave Rules")
    with st.form("rules_form"):
        sandwich  = st.checkbox("Sandwich Rule for CL",
                                value=cfg.get("sandwich_rule","true")=="true")
        pl_rate   = st.number_input("PL: 1 day per N days worked",
                                    value=int(cfg.get("pl_accrual_days_worked_rate",20)), min_value=1)
        cl_sl_tot = st.number_input("CL/SL days per year",
                                    value=int(cfg.get("cl_sl_total_per_year",14)), min_value=1)
        max_cf    = st.number_input("Max PL carry forward",
                                    value=int(cfg.get("max_carry_forward",30)), min_value=0)
        multi_lvl = st.checkbox("Multi-level Approval (Manager → HR)",
                                value=cfg.get("multi_level_approval","true")=="true")
        auto_sl   = st.checkbox("Auto-approve Sick Leave ≤ 2 days",
                                value=cfg.get("auto_approve_sick_leave","true")=="true")
        allow_co  = st.checkbox("Allow Comp Off",
                                value=cfg.get("allow_comp_leave","true")=="true")
        if st.form_submit_button("Save Rules", use_container_width=True):
            for k, v in [
                ("sandwich_rule",               str(sandwich).lower()),
                ("pl_accrual_days_worked_rate",  str(pl_rate)),
                ("cl_sl_total_per_year",         str(cl_sl_tot)),
                ("max_carry_forward",            str(max_cf)),
                ("multi_level_approval",         str(multi_lvl).lower()),
                ("auto_approve_sick_leave",      str(auto_sl).lower()),
                ("allow_comp_leave",             str(allow_co).lower()),
            ]:
                set_config(k, v)
            st.success("Rules saved.")

    st.markdown("---")
    st.subheader("Public Holidays")
    for h in holidays:
        hc1, hc2, hc3 = st.columns([2, 4, 1])
        hc1.write(str(h["date_str"])[:10])
        hc2.write(h["name"])
        if hc3.button("Remove", key=f"hd_{h['id']}"):
            sb.table("public_holidays").delete().eq("id", h["id"]).execute()
            st.rerun()

    with st.form("add_holiday"):
        hh1, hh2 = st.columns(2)
        h_date = hh1.date_input("Date")
        h_name = hh2.text_input("Holiday Name")
        if st.form_submit_button("Add Holiday"):
            if h_name.strip():
                sb.table("public_holidays").insert({
                    "date_str": h_date.isoformat(),
                    "name":     h_name.strip(),
                }).execute()
                st.rerun()

    st.markdown("---")
    st.subheader("Year-End Closure")
    st.warning("This carries forward PL balances and resets CL/SL for the new year.")
    if st.button("Perform Year-End Closure", type="primary"):
        _year_end_closure(cfg, holidays, user_email)


def _year_end_closure(cfg, holidays, user_email):
    requests = get_requests()
    approved = get_approved_leaves()
    emps     = get_employees()
    max_cf   = int(cfg.get("max_carry_forward", 30))
    act_year = int(cfg.get("active_leave_year", date.today().year))
    for emp in emps:
        b = get_emp_balances(emp, f"{act_year}-12-31", cfg, requests, approved, holidays)
        new_bf = min(max_cf, max(0, b["PL"]["net"]))
        sb.table("employees").update({
            "pl_brought_forward": new_bf, "pl_used": 0, "pl_adjustment": 0,
            "cl_sl_used": 0, "cl_sl_adjustment": 0,
        }).eq("id", emp["id"]).execute()
    new_year = act_year + 1
    set_config("active_leave_year", str(new_year))
    set_config("system_date", f"{new_year}-01-01")
    notify(user_email, "LMS: Year-End Closure Complete", [
        f"<b>Year {act_year} closed.</b>",
        f"PL carried forward (max {max_cf} days). CL/SL reset.",
        f"Active year is now {new_year}.",
    ])
    st.success(f"Year {act_year} closed. Active year is now {new_year}.")
    st.rerun()

# ──────────────────────────────────────────────
#  PROFILE (both roles)
# ──────────────────────────────────────────────
def tab_profile():
    st.title("👤 My Profile")
    user = st.session_state.user
    emps = get_employees()

    emp_options = ["— None —"] + [e["name"] for e in emps]
    current_emp = get_employee(user.get("emp_id"))
    cur_idx     = (emp_options.index(current_emp["name"])
                   if current_emp and current_emp["name"] in emp_options else 0)

    with st.form("profile_form"):
        new_email = st.text_input("Email Address", value=user.get("email", ""))
        new_pwd   = st.text_input("New Password (blank = no change)", type="password")
        confirm   = st.text_input("Confirm New Password",              type="password")
        emp_sel   = st.selectbox("My Employee Profile", emp_options, index=cur_idx)
        submitted = st.form_submit_button("Save Changes", use_container_width=True)

    if submitted:
        if new_pwd and new_pwd != confirm:
            st.error("Passwords do not match.")
            return
        if new_pwd and len(new_pwd) < 6:
            st.error("Password must be at least 6 characters.")
            return
        sel_emp = next((e for e in emps if e["name"] == emp_sel), None)
        updates = {
            "email":  new_email,
            "emp_id": sel_emp["id"] if sel_emp else None,
        }
        if new_pwd:
            updates["password_hash"] = hash_password(new_pwd)
        sb.table("users").update(updates).eq("id", user["id"]).execute()
        st.session_state.user = {**user, **updates}
        notify(new_email, "LMS: Profile Updated", [
            f"<b>Hi {user['username']},</b>",
            "Your profile has been updated.",
            f"Email: {new_email}",
            f"Employee profile: {sel_emp['name'] if sel_emp else 'None'}",
            "Password changed." if new_pwd else "",
        ])
        st.success("Profile updated.")

    st.markdown("---")
    st.markdown(f"**Username:** `{user['username']}`")
    st.markdown(f"**Role:** `{user.get('role', 'user')}`")
    st.markdown(f"**Email:** {user.get('email', '—')}")
    if current_emp:
        st.markdown(f"**Employee Profile:** {current_emp['name']}  ({current_emp['role']})")

# ──────────────────────────────────────────────
#  MAIN
# ──────────────────────────────────────────────
ADMIN_ONLY = {"dashboard", "pending", "reports", "employees", "settings"}
USER_ONLY  = {"my_portal"}


def main():
    st.set_page_config(
        page_title=APP_NAME,
        page_icon=APP_ICON,
        layout="wide",
        initial_sidebar_state="expanded",
    )
    st.markdown("""
    <style>
    .stButton > button { border-radius: 8px; }
    [data-testid="stSidebar"] { background: #1e293b; }
    [data-testid="stSidebar"] * { color: #f1f5f9 !important; }
    [data-testid="stSidebar"] .stButton > button {
        background:#334155; color:#f1f5f9 !important;
        border:1px solid #475569; margin-bottom:4px;
    }
    [data-testid="stSidebar"] .stButton > button[kind="primary"] {
        background:#3B82F6 !important; border-color:#3B82F6 !important;
    }
    </style>""", unsafe_allow_html=True)

    init_state()

    if not st.session_state.logged_in:
        if st.session_state.page == "register":
            register_page()
        else:
            login_page()
        return

    sidebar()

    tab = st.session_state.tab

    # Access guards
    if not is_admin() and tab in ADMIN_ONLY:
        st.error("You do not have permission to view this page.")
        return
    if is_admin() and tab in USER_ONLY:
        st.error("'My Portal' is for employees only. Admins use the Dashboard.")
        return

    dispatch = {
        "dashboard": tab_dashboard,
        "my_portal": tab_my_portal,
        "calendar":  tab_calendar,
        "pending":   tab_pending,
        "comp_off":  tab_comp_off,
        "reports":   tab_reports,
        "employees": tab_employees,
        "settings":  tab_settings,
        "profile":   tab_profile,
    }
    fn = dispatch.get(tab)
    if fn:
        fn()


if __name__ == "__main__":
    main()
