let supabaseClient = null;
let databaseReady = false;
let locationsReady = false;
let departmentsReady = false;
let splitAttendanceReady = false;

const state = {
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  selectedDate: formatDateISO(new Date()),
  employees: [],
  locations: [],
  departments: [],
  attendance: []
};

const employeeLocationFilter = document.getElementById('employeeLocationFilter');
const employeeLocationSelect = document.getElementById('location');
const employeeDepartmentSelect = document.getElementById('department');
const attendanceLocationSelect = document.getElementById('attendanceLocationSelect');
const employeeTableBody = document.getElementById('employeeTableBody');
const locationTableBody = document.getElementById('locationTableBody');
const departmentTableBody = document.getElementById('departmentTableBody');
const attendanceTableBody = document.getElementById('attendanceTableBody');
const employeeForm = document.getElementById('employeeForm');
const locationForm = document.getElementById('locationForm');
const departmentForm = document.getElementById('departmentForm');
const loginForm = document.getElementById('loginForm');
const logoutForm = document.getElementById('logoutForm');
const attendanceEmployee = document.getElementById('attendanceEmployee');
const attendanceDate = document.getElementById('attendanceDate');
const calendar = document.getElementById('calendar');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');
const databaseStatus = document.getElementById('databaseStatus');

async function init() {
  bindEvents();

  const runtimeConfig = await loadSupabaseConfig();
  if (runtimeConfig?.enabled && runtimeConfig.url && runtimeConfig.anonKey && window.supabase) {
    supabaseClient = window.supabase.createClient(runtimeConfig.url, runtimeConfig.anonKey);
    const loadResult = await loadSupabaseData();
    databaseReady = loadResult.connected;
    locationsReady = loadResult.locationsReady;
    departmentsReady = loadResult.departmentsReady;
    splitAttendanceReady = loadResult.splitAttendanceReady;
    if (!databaseReady) {
      setDatabaseStatus('Could not load employee or attendance data. Check the Supabase tables and policies.', 'error');
    } else {
      const migrationNeeded = !locationsReady || !departmentsReady || !splitAttendanceReady;
      setDatabaseStatus(
        migrationNeeded ? 'Connected to Supabase. Run supabase-workforce-migration.sql to enable all features.' : 'Connected to Supabase.',
        migrationNeeded ? 'warning' : 'connected'
      );
    }
  } else {
    state.employees = [];
    state.attendance = [];
    setDatabaseStatus('Supabase is unavailable here. Open the deployed Vercel site or run this project with Vercel CLI.', 'error');
  }

  renderAll();
}

async function loadSupabaseConfig() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      return null;
    }

    const config = await response.json();
    return config.enabled ? config : null;
  } catch (error) {
    return null;
  }
}

function setDatabaseStatus(message, status) {
  databaseStatus.textContent = message;
  databaseStatus.className = `database-status ${status}`;
}

function setAttendanceFormAvailability() {
  const canRecord = databaseReady && splitAttendanceReady && Boolean(attendanceEmployee.value);
  loginForm.querySelector('[type="submit"]').disabled = !canRecord;
  logoutForm.querySelector('[type="submit"]').disabled = !canRecord;
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active'));
      document.querySelectorAll('.panel').forEach((panel) => panel.classList.remove('active-panel'));
      button.classList.add('active');
      const target = document.getElementById(button.dataset.section);
      target.classList.add('active-panel');
    });
  });

  employeeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!databaseReady || !locationsReady || !departmentsReady) return;

    const form = event.currentTarget;
    const newEmployee = {
      id: crypto.randomUUID(),
      name: form.employeeName.value.trim(),
      fatherName: form.fatherName.value.trim(),
      employeeId: form.employeeId.value.trim(),
      department: form.department.value,
      location: form.location.value,
      email: form.email.value.trim(),
      phone: form.phone.value.trim()
    };

    if (!newEmployee.name || !newEmployee.employeeId || !newEmployee.department || !newEmployee.location) {
      alert('Please fill in all required employee fields.');
      return;
    }

    const { data, error } = await supabaseClient.from('employees').insert([toDbEmployee(newEmployee)]).select();
    if (error) {
      alert('Supabase employee save failed. Check your table setup.');
      console.error(error);
      return;
    }
    state.employees.push(mapDbEmployeeToApp(data[0]));

    renderAll();
    form.reset();
  });

  locationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!databaseReady || !locationsReady) return;

    const name = locationForm.locationName.value.trim();
    if (!name) return;

    const { data, error } = await supabaseClient.from('locations').insert([{ name }]).select().single();
    if (error) {
      alert(error.code === '23505' ? 'That location already exists.' : 'Supabase could not save this location.');
      console.error(error);
      return;
    }

    state.locations.push(data);
    renderAll();
    locationForm.reset();
  });

  departmentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!databaseReady || !departmentsReady) return;

    const name = departmentForm.departmentName.value.trim();
    if (!name) return;

    const { data, error } = await supabaseClient.from('departments').insert([{ name }]).select().single();
    if (error) {
      alert(error.code === '23505' ? 'That department already exists.' : 'Supabase could not save this department.');
      console.error(error);
      return;
    }

    state.departments.push(data);
    renderAll();
    departmentForm.reset();
  });

  employeeLocationFilter.addEventListener('change', renderEmployeesTable);
  attendanceLocationSelect.addEventListener('change', updateAttendanceEmployees);
  attendanceEmployee.addEventListener('change', updateAttendanceInputs);
  attendanceDate.addEventListener('change', (event) => {
    state.selectedDate = event.target.value;
    updateAttendanceInputs();
  });

  loginForm.addEventListener('submit', (event) => saveAttendanceEvent(event, 'login'));
  logoutForm.addEventListener('submit', (event) => saveAttendanceEvent(event, 'logout'));

  document.getElementById('prevMonth').addEventListener('click', () => {
    state.currentMonth -= 1;
    if (state.currentMonth < 0) {
      state.currentMonth = 11;
      state.currentYear -= 1;
    }
    renderCalendar();
  });

  document.getElementById('nextMonth').addEventListener('click', () => {
    state.currentMonth += 1;
    if (state.currentMonth > 11) {
      state.currentMonth = 0;
      state.currentYear += 1;
    }
    renderCalendar();
  });
}

async function saveAttendanceEvent(event, eventType) {
  event.preventDefault();
  if (!databaseReady || !splitAttendanceReady) return;

  const employeeId = attendanceEmployee.value;
  const date = attendanceDate.value;
  const timeInput = document.getElementById(eventType === 'login' ? 'loginTime' : 'logoutTime');
  const time = timeInput.value;
  if (!employeeId || !date || !time) return;

  const employee = getEmployeeById(employeeId);
  const table = eventType === 'login' ? 'attendance_logins' : 'attendance_logouts';
  const timeColumn = eventType === 'login' ? 'login_time' : 'logout_time';
  const row = {
    id: crypto.randomUUID(),
    employee_id: employeeId,
    date,
    [timeColumn]: time,
    location: employee?.location || ''
  };
  const { data, error } = await supabaseClient
    .from(table)
    .upsert([row], { onConflict: 'employee_id,date' })
    .select()
    .single();

  if (error) {
    alert(`Could not save ${eventType}. Check the Supabase setup.`);
    console.error(error);
    return;
  }

  const record = getAttendanceRecord(employeeId, date);
  if (eventType === 'login') {
    record.loginId = data.id;
    record.loginTime = normalizeTime(data.login_time);
  } else {
    record.logoutId = data.id;
    record.logoutTime = normalizeTime(data.logout_time);
  }
  record.location = data.location;
  renderAll();
}

async function loadSupabaseData() {
  const [
    { data: employeeRows, error: employeeError },
    { data: attendanceRows, error: attendanceError }
  ] = await Promise.all([
    supabaseClient.from('employees').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('attendance').select('*').order('date', { ascending: true })
  ]);

  if (employeeError || attendanceError) {
    console.error(employeeError || attendanceError);
    state.employees = [];
    state.attendance = [];
    state.locations = [];
    state.departments = [];
    return { connected: false, locationsReady: false, departmentsReady: false, splitAttendanceReady: false };
  }

  state.employees = (employeeRows || []).map(mapDbEmployeeToApp);
  const [
    { data: locationRows, error: locationError },
    { data: departmentRows, error: departmentError },
    { data: loginRows, error: loginError },
    { data: logoutRows, error: logoutError }
  ] = await Promise.all([
    supabaseClient.from('locations').select('*').order('name', { ascending: true }),
    supabaseClient.from('departments').select('*').order('name', { ascending: true }),
    supabaseClient.from('attendance_logins').select('*').order('date', { ascending: true }),
    supabaseClient.from('attendance_logouts').select('*').order('date', { ascending: true })
  ]);

  if (locationError) {
    console.warn('Location table is unavailable. Run the workforce migration.', locationError);
    state.locations = [...new Set(state.employees.map((employee) => employee.location))].map((name) => ({ name }));
  } else {
    state.locations = locationRows || [];
  }

  if (departmentError) {
    console.warn('Department table is unavailable. Run the workforce migration.', departmentError);
    state.departments = [...new Set(state.employees.map((employee) => employee.department))].map((name) => ({ name }));
  } else {
    state.departments = departmentRows || [];
  }

  const splitAttendanceReady = !loginError && !logoutError;
  if (splitAttendanceReady) {
    state.attendance = mergeAttendanceEvents(loginRows || [], logoutRows || []);
  } else {
    console.warn('Split attendance tables are unavailable. Run the workforce migration.');
    state.attendance = (attendanceRows || []).map(mapDbAttendanceToApp);
  }

  return {
    connected: true,
    locationsReady: !locationError,
    departmentsReady: !departmentError,
    splitAttendanceReady
  };
}

function renderAll() {
  employeeForm.querySelector('[type="submit"]').disabled = !databaseReady || !locationsReady || !departmentsReady || !state.locations.length || !state.departments.length;
  locationForm.querySelector('[type="submit"]').disabled = !databaseReady || !locationsReady;
  departmentForm.querySelector('[type="submit"]').disabled = !databaseReady || !departmentsReady;
  setAttendanceFormAvailability();
  renderDashboard();
  renderLocationsTable();
  renderDepartmentsTable();
  renderLocationFilters();
  renderEmployeesTable();
  renderCalendar();
  renderAttendanceTable();
}

function renderDashboard() {
  const employees = state.employees;
  const totalLocations = state.locations.length;
  const today = formatDateISO(new Date());
  const loggedInToday = state.attendance.filter((record) => record.date === today && record.loginTime).length;
  const loggedOutToday = state.attendance.filter((record) => record.date === today && record.logoutTime).length;

  document.getElementById('totalEmployees').textContent = employees.length;
  document.getElementById('totalLocations').textContent = totalLocations;
  document.getElementById('loggedInToday').textContent = loggedInToday;
  document.getElementById('loggedOutToday').textContent = loggedOutToday;

  const summary = state.locations.map((location) => [
    location.name,
    employees.filter((employee) => employee.location === location.name).length
  ]);

  const container = document.getElementById('locationSummary');
  container.innerHTML = summary.length
    ? summary.map(([location, count]) => `
      <div class="location-item">
        <strong>${escapeHtml(location)}</strong>
        <span>${count} employees</span>
      </div>
    `).join('')
    : '<div class="empty-state">No employee data available yet.</div>';
}

function renderLocationFilters() {
  const locations = state.locations.map((location) => location.name).sort();
  const departments = state.departments.map((department) => department.name).sort();
  const selectedEmployeeLocation = employeeLocationSelect.value;
  const selectedEmployeeDepartment = employeeDepartmentSelect.value;
  const selectedEmployeeFilter = employeeLocationFilter.value;
  const selectedAttendanceLocation = attendanceLocationSelect.value;

  employeeLocationSelect.innerHTML = '<option value="">Select location</option>' +
    locations.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join('');
  employeeLocationSelect.value = locations.includes(selectedEmployeeLocation) ? selectedEmployeeLocation : '';

  employeeDepartmentSelect.innerHTML = '<option value="">Select department</option>' +
    departments.map((department) => `<option value="${escapeHtml(department)}">${escapeHtml(department)}</option>`).join('');
  employeeDepartmentSelect.value = departments.includes(selectedEmployeeDepartment) ? selectedEmployeeDepartment : '';

  employeeLocationFilter.innerHTML = '<option value="all">All locations</option>' +
    locations.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join('');
  employeeLocationFilter.value = locations.includes(selectedEmployeeFilter) ? selectedEmployeeFilter : 'all';

  attendanceLocationSelect.innerHTML = '<option value="">Select location</option>' +
    locations.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join('');
  attendanceLocationSelect.value = locations.includes(selectedAttendanceLocation) ? selectedAttendanceLocation : '';

  updateAttendanceEmployees();
}

function renderLocationsTable() {
  locationTableBody.innerHTML = state.locations.length
    ? state.locations.map((location) => {
      const employeeCount = state.employees.filter((employee) => employee.location === location.name).length;
      return `
        <tr>
          <td>${escapeHtml(location.name)}</td>
          <td>${employeeCount}</td>
          <td><button class="danger-btn" data-delete-location="${escapeHtml(location.name)}" ${locationsReady ? '' : 'disabled'}>Delete</button></td>
        </tr>
      `;
    }).join('')
    : '<tr><td colspan="3" class="empty-state">No locations have been added.</td></tr>';

  document.querySelectorAll('[data-delete-location]').forEach((button) => {
    button.addEventListener('click', () => deleteLocation(button.dataset.deleteLocation));
  });
}

function renderDepartmentsTable() {
  departmentTableBody.innerHTML = state.departments.length
    ? state.departments.map((department) => {
      const employeeCount = state.employees.filter((employee) => employee.department === department.name).length;
      return `
        <tr>
          <td>${escapeHtml(department.name)}</td>
          <td>${employeeCount}</td>
          <td><button class="danger-btn" data-delete-department="${escapeHtml(department.name)}" ${departmentsReady ? '' : 'disabled'}>Delete</button></td>
        </tr>
      `;
    }).join('')
    : '<tr><td colspan="3" class="empty-state">No departments have been added.</td></tr>';

  document.querySelectorAll('[data-delete-department]').forEach((button) => {
    button.addEventListener('click', () => deleteDepartment(button.dataset.deleteDepartment));
  });
}

async function deleteDepartment(name) {
  if (!databaseReady || !departmentsReady) return;
  if (state.employees.some((employee) => employee.department === name)) {
    alert('This department is assigned to employees. Reassign or remove them first.');
    return;
  }

  if (!confirm(`Delete department ${name}?`)) return;
  const { error } = await supabaseClient.from('departments').delete().eq('name', name);
  if (error) {
    console.error(error);
    alert('Supabase could not delete this department.');
    return;
  }

  state.departments = state.departments.filter((department) => department.name !== name);
  renderAll();
}

async function deleteLocation(name) {
  if (!databaseReady || !locationsReady) return;
  if (state.employees.some((employee) => employee.location === name)) {
    alert('This location is assigned to employees. Reassign or remove them first.');
    return;
  }

  const confirmed = confirm(`Delete location ${name}?`);
  if (!confirmed) return;

  const { error } = await supabaseClient.from('locations').delete().eq('name', name);
  if (error) {
    console.error(error);
    alert('Supabase could not delete this location.');
    return;
  }

  state.locations = state.locations.filter((location) => location.name !== name);
  renderAll();
}

function renderEmployeesTable() {
  const selectedLocation = employeeLocationFilter.value;
  const filteredEmployees = selectedLocation === 'all'
    ? state.employees
    : state.employees.filter((employee) => employee.location === selectedLocation);

  employeeTableBody.innerHTML = filteredEmployees.length
    ? filteredEmployees.map((employee) => `
      <tr>
        <td>${escapeHtml(employee.name)}</td>
        <td>${escapeHtml(employee.fatherName || '-')}</td>
        <td>${escapeHtml(employee.employeeId)}</td>
        <td>${escapeHtml(employee.department)}</td>
        <td>${escapeHtml(employee.location)}</td>
        <td>${escapeHtml(employee.email || '-')}</td>
        <td>${escapeHtml(employee.phone || '-')}</td>
        <td>
          <button class="danger-btn" data-delete-employee="${employee.id}">Delete</button>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="8" class="empty-state">No employees in this location.</td></tr>';

  document.querySelectorAll('[data-delete-employee]').forEach((button) => {
    button.addEventListener('click', () => deleteEmployee(button.dataset.deleteEmployee));
  });
}

async function deleteEmployee(employeeId) {
  if (!databaseReady) return;

  const employee = getEmployeeById(employeeId);
  const confirmed = confirm(`Delete employee ${employee?.name || 'record'}?`);
  if (!confirmed) return;

  const deletionRequests = [supabaseClient.from('attendance').delete().eq('employee_id', employeeId)];
  if (splitAttendanceReady) {
    deletionRequests.push(
      supabaseClient.from('attendance_logins').delete().eq('employee_id', employeeId),
      supabaseClient.from('attendance_logouts').delete().eq('employee_id', employeeId)
    );
  }
  deletionRequests.push(supabaseClient.from('employees').delete().eq('id', employeeId));
  const deletionResults = await Promise.all(deletionRequests);
  const deletionError = deletionResults.find((result) => result.error)?.error;

  if (deletionError) {
    console.error(deletionError);
    alert('Deletion failed in Supabase.');
    return;
  }

  state.employees = state.employees.filter((employee) => employee.id !== employeeId);
  state.attendance = state.attendance.filter((record) => record.employeeId !== employeeId);
  renderAll();
}

function updateAttendanceEmployees() {
  const location = attendanceLocationSelect.value;
  const employeesInLocation = state.employees.filter((employee) => !location || employee.location === location);
  const selectedEmployeeId = attendanceEmployee.value;
  attendanceEmployee.innerHTML = '<option value="">Select employee</option>' +
    employeesInLocation.map((employee) => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)} (${escapeHtml(employee.employeeId)})</option>`).join('');

  attendanceEmployee.value = employeesInLocation.some((employee) => employee.id === selectedEmployeeId) ? selectedEmployeeId : '';

  attendanceDate.value = state.selectedDate;
  updateAttendanceInputs();
}

function updateAttendanceInputs() {
  const date = state.selectedDate;
  attendanceDate.value = date;
  const selectedLocation = attendanceLocationSelect.value;
  const employeeId = attendanceEmployee.value;
  const record = state.attendance.find((entry) => entry.date === date && entry.employeeId === employeeId);

  document.getElementById('loginTime').value = record?.loginTime || '';
  document.getElementById('logoutTime').value = record?.logoutTime || '';

  if (selectedLocation && attendanceEmployee.options.length === 1) {
    attendanceEmployee.setAttribute('disabled', 'disabled');
  } else {
    attendanceEmployee.removeAttribute('disabled');
  }
  setAttendanceFormAvailability();
}

function renderCalendar() {
  const firstDayOfMonth = new Date(state.currentYear, state.currentMonth, 1);
  const lastDayOfMonth = new Date(state.currentYear, state.currentMonth + 1, 0);
  const startDay = new Date(state.currentYear, state.currentMonth, 1).getDay();
  const totalDays = lastDayOfMonth.getDate();

  calendarMonthLabel.textContent = new Date(state.currentYear, state.currentMonth).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const prevMonthDays = new Date(state.currentYear, state.currentMonth, 0).getDate();

  const cells = [];

  dayNames.forEach((day) => {
    cells.push(`<div class="day-name">${day}</div>`);
  });

  for (let i = 0; i < startDay; i += 1) {
    const prevDate = prevMonthDays - startDay + i + 1;
    cells.push(`<div class="day-cell muted" data-date="${new Date(state.currentYear, state.currentMonth - 1, prevDate).toISOString().split('T')[0]}">
      <span class="date-number">${prevDate}</span>
    </div>`);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = formatDateISO(new Date(state.currentYear, state.currentMonth, day));
    const hasRecord = state.attendance.some((entry) => entry.date === date);
    const selectedClass = date === state.selectedDate ? 'selected' : '';

    cells.push(`<div class="day-cell ${selectedClass} ${hasRecord ? 'has-record' : ''}" data-date="${date}">
      <span class="date-number">${day}</span>
      ${hasRecord ? '<span class="dot" title="Entries recorded"></span>' : ''}
    </div>`);
  }

  const remainingCells = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= remainingCells; i += 1) {
    const nextDate = new Date(state.currentYear, state.currentMonth + 1, i);
    cells.push(`<div class="day-cell muted" data-date="${formatDateISO(nextDate)}">
      <span class="date-number">${i}</span>
    </div>`);
  }

  calendar.innerHTML = cells.join('');

  document.querySelectorAll('.day-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      state.selectedDate = cell.dataset.date;
      attendanceDate.value = state.selectedDate;
      renderCalendar();
      renderAttendanceTable();
      updateAttendanceInputs();
    });
  });
}

function renderAttendanceTable() {
  const selectedDate = state.selectedDate;
  const records = state.attendance
    .filter((entry) => entry.date === selectedDate)
    .sort((a, b) => (getEmployeeById(a.employeeId)?.name || '').localeCompare(getEmployeeById(b.employeeId)?.name || ''));

  if (!records.length) {
    attendanceTableBody.innerHTML = '<tr><td colspan="9" class="empty-state">No attendance recorded for this date.</td></tr>';
    return;
  }

  attendanceTableBody.innerHTML = records.map((record) => {
    const employee = getEmployeeById(record.employeeId);
    return `
      <tr>
        <td>${escapeHtml(employee ? employee.name : 'Unknown Employee')}</td>
        <td>${escapeHtml(employee ? employee.fatherName || '-' : '-')}</td>
        <td>${escapeHtml(employee ? employee.department : '-')}</td>
        <td>${escapeHtml(employee ? employee.location : '-')}</td>
        <td>${record.date}</td>
        <td>${record.loginTime || '<span class="pending-time">Not recorded</span>'}</td>
        <td>${record.logoutTime || '<span class="pending-time">Not recorded</span>'}</td>
        <td>${calculateWorkedDuration(record)}</td>
        <td>
          <button class="danger-btn" data-delete-attendance="${escapeHtml(record.employeeId)}" data-attendance-date="${escapeHtml(record.date)}">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('[data-delete-attendance]').forEach((button) => {
    button.addEventListener('click', () => deleteAttendance(button.dataset.deleteAttendance, button.dataset.attendanceDate));
  });
}

async function deleteAttendance(employeeId, date) {
  if (!databaseReady) return;
  if (!confirm('Delete this employee attendance for the selected date?')) return;

  if (splitAttendanceReady) {
    const [{ error: loginError }, { error: logoutError }] = await Promise.all([
      supabaseClient.from('attendance_logins').delete().eq('employee_id', employeeId).eq('date', date),
      supabaseClient.from('attendance_logouts').delete().eq('employee_id', employeeId).eq('date', date)
    ]);
    if (loginError || logoutError) {
      console.error(loginError || logoutError);
      alert('Supabase attendance deletion failed.');
      return;
    }
  } else {
    const { error } = await supabaseClient.from('attendance').delete().eq('employee_id', employeeId).eq('date', date);
    if (error) {
      console.error(error);
      alert('Supabase attendance deletion failed.');
      return;
    }
  }

  state.attendance = state.attendance.filter((entry) => !(entry.employeeId === employeeId && entry.date === date));
  renderAll();
}

function getAttendanceRecord(employeeId, date) {
  let record = state.attendance.find((entry) => entry.employeeId === employeeId && entry.date === date);
  if (!record) {
    record = { employeeId, date, loginTime: '', logoutTime: '', loginId: null, logoutId: null, location: '' };
    state.attendance.push(record);
  }
  return record;
}

function mergeAttendanceEvents(loginRows, logoutRows) {
  const records = new Map();
  loginRows.forEach((row) => {
    const record = getOrCreateAttendanceRecord(records, row.employee_id, row.date);
    record.loginId = row.id;
    record.loginTime = normalizeTime(row.login_time);
    record.location = row.location || record.location;
  });
  logoutRows.forEach((row) => {
    const record = getOrCreateAttendanceRecord(records, row.employee_id, row.date);
    record.logoutId = row.id;
    record.logoutTime = normalizeTime(row.logout_time);
    record.location = row.location || record.location;
  });
  return [...records.values()];
}

function getOrCreateAttendanceRecord(records, employeeId, date) {
  const key = `${employeeId}:${date}`;
  if (!records.has(key)) {
    records.set(key, { employeeId, date, loginTime: '', logoutTime: '', loginId: null, logoutId: null, location: '' });
  }
  return records.get(key);
}

function normalizeTime(value) {
  return value ? String(value).slice(0, 5) : '';
}

function calculateWorkedDuration(record) {
  if (!record.loginTime) return '<span class="pending-time">Not started</span>';
  if (!record.logoutTime) return '<span class="pending-time">In progress</span>';

  const [loginHour, loginMinute] = record.loginTime.split(':').map(Number);
  const [logoutHour, logoutMinute] = record.logoutTime.split(':').map(Number);
  let minutes = logoutHour * 60 + logoutMinute - (loginHour * 60 + loginMinute);
  if (minutes < 0) minutes += 24 * 60;

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function getEmployeeById(employeeId) {
  return state.employees.find((employee) => employee.id === employeeId);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function mapDbEmployeeToApp(row) {
  return {
    id: row.id,
    name: row.name,
    fatherName: row.father_name || row.fatherName || '',
    employeeId: row.employee_id || row.employeeId,
    department: row.department,
    location: row.location,
    email: row.email || '',
    phone: row.phone || ''
  };
}

function mapDbAttendanceToApp(row) {
  return {
    employeeId: row.employee_id || row.employeeId,
    date: row.date,
    loginTime: normalizeTime(row.login_time || row.loginTime),
    logoutTime: normalizeTime(row.logout_time || row.logoutTime),
    location: row.location || '',
    loginId: null,
    logoutId: null
  };
}

function toDbEmployee(employee) {
  return {
    id: employee.id,
    name: employee.name,
    father_name: employee.fatherName || '',
    employee_id: employee.employeeId,
    department: employee.department,
    location: employee.location,
    email: employee.email || '',
    phone: employee.phone || '',
    created_at: new Date().toISOString()
  };
}

function formatDateISO(date) {
  const newDate = new Date(date);
  const offset = newDate.getTimezoneOffset();
  const adjusted = new Date(newDate.getTime() - offset * 60 * 1000);
  return adjusted.toISOString().split('T')[0];
}

init();
