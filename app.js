let supabaseClient = null;
let databaseReady = false;
let locationsReady = false;

const state = {
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  selectedDate: formatDateISO(new Date()),
  employees: [],
  locations: [],
  attendance: []
};

const employeeLocationFilter = document.getElementById('employeeLocationFilter');
const employeeLocationSelect = document.getElementById('location');
const attendanceLocationSelect = document.getElementById('attendanceLocationSelect');
const employeeTableBody = document.getElementById('employeeTableBody');
const locationTableBody = document.getElementById('locationTableBody');
const attendanceTableBody = document.getElementById('attendanceTableBody');
const employeeForm = document.getElementById('employeeForm');
const locationForm = document.getElementById('locationForm');
const attendanceForm = document.getElementById('attendanceForm');
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
    if (!databaseReady) {
      setDatabaseStatus('Could not load employee or attendance data. Check the Supabase tables and policies.', 'error');
    } else if (!locationsReady) {
      setDatabaseStatus('Connected to Supabase. Run supabase-location-migration.sql to enable location management.', 'warning');
    } else {
      setDatabaseStatus('Connected to Supabase.', 'connected');
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
    if (!databaseReady || !state.locations.length) return;

    const form = event.currentTarget;
    const newEmployee = {
      id: crypto.randomUUID(),
      name: form.employeeName.value.trim(),
      employeeId: form.employeeId.value.trim(),
      department: form.department.value.trim(),
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

  employeeLocationFilter.addEventListener('change', renderEmployeesTable);
  attendanceLocationSelect.addEventListener('change', updateAttendanceEmployees);
  attendanceEmployee.addEventListener('change', updateAttendanceInputs);
  attendanceDate.addEventListener('change', (event) => {
    state.selectedDate = event.target.value;
    updateAttendanceInputs();
  });

  attendanceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!databaseReady) return;

    const selectedEmployeeId = attendanceEmployee.value;
    const date = attendanceDate.value;
    const loginTime = document.getElementById('loginTime').value;
    const logoutTime = document.getElementById('logoutTime').value;

    if (!selectedEmployeeId || !date || !loginTime || !logoutTime) {
      alert('Please complete all fields before saving attendance.');
      return;
    }

    const recordIndex = state.attendance.findIndex((entry) => entry.employeeId === selectedEmployeeId && entry.date === date);
    const attendanceEntry = {
      id: recordIndex >= 0 ? state.attendance[recordIndex].id : crypto.randomUUID(),
      employeeId: selectedEmployeeId,
      date,
      loginTime,
      logoutTime,
      location: getEmployeeById(selectedEmployeeId)?.location || ''
    };

    const { error } = await supabaseClient.from('attendance').upsert([toDbAttendance(attendanceEntry)], { onConflict: 'id' });
    if (error) {
      alert('Supabase attendance save failed. Check your table setup.');
      console.error(error);
      return;
    }

    const existingIndex = state.attendance.findIndex((entry) => entry.id === attendanceEntry.id);
    if (existingIndex >= 0) {
      state.attendance[existingIndex] = attendanceEntry;
    } else {
      state.attendance.push(attendanceEntry);
    }

    renderAll();
  });

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
    return { connected: false, locationsReady: false };
  }

  state.employees = (employeeRows || []).map(mapDbEmployeeToApp);
  state.attendance = (attendanceRows || []).map(mapDbAttendanceToApp);

  const { data: locationRows, error: locationError } = await supabaseClient.from('locations').select('*').order('name', { ascending: true });
  if (locationError) {
    console.warn('Location table is unavailable. Run the supplied location migration.', locationError);
    state.locations = [...new Set(state.employees.map((employee) => employee.location))].map((name) => ({ name }));
    return { connected: true, locationsReady: false };
  }

  state.locations = locationRows || [];
  return { connected: true, locationsReady: true };
}

function renderAll() {
  employeeForm.querySelector('[type="submit"]').disabled = !databaseReady || !state.locations.length;
  locationForm.querySelector('[type="submit"]').disabled = !databaseReady || !locationsReady;
  attendanceForm.querySelector('[type="submit"]').disabled = !databaseReady;
  renderDashboard();
  renderLocationsTable();
  renderLocationFilters();
  renderEmployeesTable();
  renderCalendar();
  renderAttendanceTable();
}

function renderDashboard() {
  const employees = state.employees;
  const totalLocations = state.locations.length;
  const today = formatDateISO(new Date());
  const loggedInToday = state.attendance.filter((record) => record.date === today).length;
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
  const selectedEmployeeLocation = employeeLocationSelect.value;
  const selectedEmployeeFilter = employeeLocationFilter.value;
  const selectedAttendanceLocation = attendanceLocationSelect.value;

  employeeLocationSelect.innerHTML = '<option value="">Select location</option>' +
    locations.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join('');
  employeeLocationSelect.value = locations.includes(selectedEmployeeLocation) ? selectedEmployeeLocation : '';

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
    : '<tr><td colspan="7" class="empty-state">No employees in this location.</td></tr>';

  document.querySelectorAll('[data-delete-employee]').forEach((button) => {
    button.addEventListener('click', () => deleteEmployee(button.dataset.deleteEmployee));
  });
}

async function deleteEmployee(employeeId) {
  if (!databaseReady) return;

  const employee = getEmployeeById(employeeId);
  const confirmed = confirm(`Delete employee ${employee?.name || 'record'}?`);
  if (!confirmed) return;

  const [{ error: attendanceError }, { error: employeeError }] = await Promise.all([
    supabaseClient.from('attendance').delete().eq('employee_id', employeeId),
    supabaseClient.from('employees').delete().eq('id', employeeId)
  ]);

  if (attendanceError || employeeError) {
    console.error(attendanceError || employeeError);
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
  attendanceEmployee.innerHTML = '<option value="">Select employee</option>' +
    employeesInLocation.map((employee) => `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)} (${escapeHtml(employee.employeeId)})</option>`).join('');

  const selected = attendanceEmployee.dataset.employeeId;
  if (selected) {
    attendanceEmployee.value = selected;
  }

  attendanceDate.value = state.selectedDate;
  updateAttendanceInputs();
}

function updateAttendanceInputs() {
  const date = state.selectedDate;
  attendanceDate.value = date;
  const selectedLocation = attendanceLocationSelect.value;
  const employeeId = attendanceEmployee.value;
  const record = state.attendance.find((entry) => entry.date === date && entry.employeeId === employeeId);

  if (record) {
    document.getElementById('loginTime').value = record.loginTime;
    document.getElementById('logoutTime').value = record.logoutTime;
  } else {
    document.getElementById('loginTime').value = '';
    document.getElementById('logoutTime').value = '';
  }

  if (selectedLocation && attendanceEmployee.options.length === 1) {
    attendanceEmployee.setAttribute('disabled', 'disabled');
  } else {
    attendanceEmployee.removeAttribute('disabled');
  }
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
  const records = state.attendance.filter((entry) => entry.date === selectedDate).sort((a, b) => a.employeeId.localeCompare(b.employeeId));

  if (!records.length) {
    attendanceTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No attendance recorded for this date.</td></tr>';
    return;
  }

  attendanceTableBody.innerHTML = records.map((record) => {
    const employee = getEmployeeById(record.employeeId);
    return `
      <tr>
        <td>${escapeHtml(employee ? employee.name : 'Unknown Employee')}</td>
        <td>${escapeHtml(employee ? employee.location : '-')}</td>
        <td>${record.date}</td>
        <td>${record.loginTime}</td>
        <td>${record.logoutTime}</td>
        <td>
          <button class="danger-btn" data-delete-attendance="${record.id}">Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('[data-delete-attendance]').forEach((button) => {
    button.addEventListener('click', () => deleteAttendance(button.dataset.deleteAttendance));
  });
}

async function deleteAttendance(attendanceId) {
  if (!databaseReady) return;

  const { error } = await supabaseClient.from('attendance').delete().eq('id', attendanceId);
  if (error) {
    console.error(error);
    alert('Supabase attendance deletion failed.');
    return;
  }

  state.attendance = state.attendance.filter((entry) => entry.id !== attendanceId);
  renderAll();
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
    employeeId: row.employee_id || row.employeeId,
    department: row.department,
    location: row.location,
    email: row.email || '',
    phone: row.phone || ''
  };
}

function mapDbAttendanceToApp(row) {
  return {
    id: row.id,
    employeeId: row.employee_id || row.employeeId,
    date: row.date,
    loginTime: row.login_time || row.loginTime,
    logoutTime: row.logout_time || row.logoutTime,
    location: row.location || ''
  };
}

function toDbEmployee(employee) {
  return {
    id: employee.id,
    name: employee.name,
    employee_id: employee.employeeId,
    department: employee.department,
    location: employee.location,
    email: employee.email || '',
    phone: employee.phone || '',
    created_at: new Date().toISOString()
  };
}

function toDbAttendance(record) {
  return {
    id: record.id,
    employee_id: record.employeeId,
    date: record.date,
    login_time: record.loginTime,
    logout_time: record.logoutTime,
    location: record.location || '',
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
