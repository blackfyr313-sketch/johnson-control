const STORAGE_KEYS = {
  employees: 'attendance-employees',
  attendance: 'attendance-records'
};

const defaultEmployees = [
  { id: crypto.randomUUID(), name: 'Aisha Khan', employeeId: 'EMP-1001', department: 'HR', location: 'Head Office', email: 'aisha@company.com', phone: '+971500111111' },
  { id: crypto.randomUUID(), name: 'Daniel Smith', employeeId: 'EMP-1002', department: 'Operations', location: 'Factory A', email: 'daniel@company.com', phone: '+971500222222' },
  { id: crypto.randomUUID(), name: 'Lina Hasan', employeeId: 'EMP-1003', department: 'Logistics', location: 'Warehouse', email: 'lina@company.com', phone: '+971500333333' },
  { id: crypto.randomUUID(), name: 'Omar Ali', employeeId: 'EMP-1004', department: 'Sales', location: 'Field Team', email: 'omar@company.com', phone: '+971500444444' },
  { id: crypto.randomUUID(), name: 'Priya Nair', employeeId: 'EMP-1005', department: 'Finance', location: 'Head Office', email: 'priya@company.com', phone: '+971500555555' }
];

const SUPABASE_CONFIG = window.SUPABASE_CONFIG || { url: '', anonKey: '', enabled: false };
const supabase = SUPABASE_CONFIG.enabled && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey
  ? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  : null;

const state = {
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  selectedDate: formatDateISO(new Date()),
  employees: [],
  attendance: []
};

const employeeLocationFilter = document.getElementById('employeeLocationFilter');
const attendanceLocationSelect = document.getElementById('attendanceLocationSelect');
const employeeTableBody = document.getElementById('employeeTableBody');
const attendanceTableBody = document.getElementById('attendanceTableBody');
const employeeForm = document.getElementById('employeeForm');
const attendanceForm = document.getElementById('attendanceForm');
const attendanceEmployee = document.getElementById('attendanceEmployee');
const attendanceDate = document.getElementById('attendanceDate');
const calendar = document.getElementById('calendar');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');

async function init() {
  bindEvents();

  if (supabase) {
    await loadSupabaseData();
  } else {
    loadLocalData();
  }

  renderAll();
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

    if (supabase) {
      const { data, error } = await supabase.from('employees').insert([toDbEmployee(newEmployee)]).select();
      if (error) {
        alert('Supabase employee save failed. Check your table setup.');
        console.error(error);
        return;
      }
      state.employees.push(mapDbEmployeeToApp(data[0]));
    } else {
      state.employees.push(newEmployee);
      saveLocalData();
    }

    renderAll();
    form.reset();
  });

  employeeLocationFilter.addEventListener('change', renderEmployeesTable);
  attendanceLocationSelect.addEventListener('change', updateAttendanceEmployees);
  attendanceDate.addEventListener('change', (event) => {
    state.selectedDate = event.target.value;
    updateAttendanceInputs();
  });

  attendanceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
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

    if (supabase) {
      const { error } = await supabase.from('attendance').upsert([toDbAttendance(attendanceEntry)], { onConflict: 'id' });
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
    } else {
      if (recordIndex >= 0) {
        state.attendance[recordIndex] = attendanceEntry;
      } else {
        state.attendance.push(attendanceEntry);
      }
      saveLocalData();
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

function loadLocalData() {
  const savedEmployees = JSON.parse(localStorage.getItem(STORAGE_KEYS.employees) || 'null');
  const savedAttendance = JSON.parse(localStorage.getItem(STORAGE_KEYS.attendance) || 'null');

  state.employees = savedEmployees && savedEmployees.length ? savedEmployees : defaultEmployees;
  state.attendance = savedAttendance || [];

  if (!localStorage.getItem(STORAGE_KEYS.employees)) {
    saveLocalData();
  }
}

async function loadSupabaseData() {
  const [{ data: employeeRows, error: employeeError }, { data: attendanceRows, error: attendanceError }] = await Promise.all([
    supabase.from('employees').select('*').order('created_at', { ascending: true }),
    supabase.from('attendance').select('*').order('date', { ascending: true })
  ]);

  if (employeeError || attendanceError) {
    console.error(employeeError || attendanceError);
    alert('Supabase connection failed. Please confirm your table names and project setup.');
    state.employees = defaultEmployees;
    state.attendance = [];
    return;
  }

  state.employees = (employeeRows || []).map(mapDbEmployeeToApp);
  state.attendance = (attendanceRows || []).map(mapDbAttendanceToApp);

  if (!state.employees.length) {
    const seededEmployees = defaultEmployees.map((employee) => ({
      ...employee,
      id: crypto.randomUUID()
    }));

    const { data: insertedEmployees } = await supabase.from('employees').insert(seededEmployees.map(toDbEmployee)).select();
    state.employees = (insertedEmployees || seededEmployees).map((employee) => mapDbEmployeeToApp(employee));
  }
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEYS.employees, JSON.stringify(state.employees));
  localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(state.attendance));
}

function renderAll() {
  renderDashboard();
  renderLocationFilters();
  renderEmployeesTable();
  renderCalendar();
  renderAttendanceTable();
}

function renderDashboard() {
  const employees = state.employees;
  const totalLocations = [...new Set(employees.map((employee) => employee.location))].length;
  const today = formatDateISO(new Date());
  const loggedInToday = state.attendance.filter((record) => record.date === today).length;
  const loggedOutToday = state.attendance.filter((record) => record.date === today && record.logoutTime).length;

  document.getElementById('totalEmployees').textContent = employees.length;
  document.getElementById('totalLocations').textContent = totalLocations;
  document.getElementById('loggedInToday').textContent = loggedInToday;
  document.getElementById('loggedOutToday').textContent = loggedOutToday;

  const summary = Object.entries(
    state.employees.reduce((acc, employee) => {
      acc[employee.location] = (acc[employee.location] || 0) + 1;
      return acc;
    }, {})
  );

  const container = document.getElementById('locationSummary');
  container.innerHTML = summary.length
    ? summary.map(([location, count]) => `
      <div class="location-item">
        <strong>${location}</strong>
        <span>${count} employees</span>
      </div>
    `).join('')
    : '<div class="empty-state">No employee data available yet.</div>';
}

function renderLocationFilters() {
  const locations = [...new Set(state.employees.map((employee) => employee.location))].sort();

  employeeLocationFilter.innerHTML = '<option value="all">All locations</option>' +
    locations.map((location) => `<option value="${location}">${location}</option>`).join('');

  attendanceLocationSelect.innerHTML = '<option value="">Select location</option>' +
    locations.map((location) => `<option value="${location}">${location}</option>`).join('');

  const currentLocation = attendanceLocationSelect.dataset.location || '';
  attendanceLocationSelect.value = currentLocation;

  updateAttendanceEmployees();
}

function renderEmployeesTable() {
  const selectedLocation = employeeLocationFilter.value;
  const filteredEmployees = selectedLocation === 'all'
    ? state.employees
    : state.employees.filter((employee) => employee.location === selectedLocation);

  employeeTableBody.innerHTML = filteredEmployees.length
    ? filteredEmployees.map((employee) => `
      <tr>
        <td>${employee.name}</td>
        <td>${employee.employeeId}</td>
        <td>${employee.department}</td>
        <td>${employee.location}</td>
        <td>${employee.email || '-'}</td>
        <td>${employee.phone || '-'}</td>
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
  const employee = getEmployeeById(employeeId);
  const confirmed = confirm(`Delete employee ${employee?.name || 'record'}?`);
  if (!confirmed) return;

  if (supabase) {
    const [{ error: attendanceError }, { error: employeeError }] = await Promise.all([
      supabase.from('attendance').delete().eq('employee_id', employeeId),
      supabase.from('employees').delete().eq('id', employeeId)
    ]);

    if (attendanceError || employeeError) {
      console.error(attendanceError || employeeError);
      alert('Deletion failed in Supabase.');
      return;
    }
  }

  state.employees = state.employees.filter((employee) => employee.id !== employeeId);
  state.attendance = state.attendance.filter((record) => record.employeeId !== employeeId);
  if (!supabase) saveLocalData();
  renderAll();
}

function updateAttendanceEmployees() {
  const location = attendanceLocationSelect.value;
  const employeesInLocation = state.employees.filter((employee) => !location || employee.location === location);
  attendanceEmployee.innerHTML = '<option value="">Select employee</option>' +
    employeesInLocation.map((employee) => `<option value="${employee.id}">${employee.name} (${employee.employeeId})</option>`).join('');

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
        <td>${employee ? employee.name : 'Unknown Employee'}</td>
        <td>${employee ? employee.location : '-'}</td>
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
  if (supabase) {
    const { error } = await supabase.from('attendance').delete().eq('id', attendanceId);
    if (error) {
      console.error(error);
      alert('Supabase attendance deletion failed.');
      return;
    }
  }

  state.attendance = state.attendance.filter((entry) => entry.id !== attendanceId);
  if (!supabase) saveLocalData();
  renderAll();
}

function getEmployeeById(employeeId) {
  return state.employees.find((employee) => employee.id === employeeId);
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
