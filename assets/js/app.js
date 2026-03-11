const form = document.getElementById('studentForm');
const submitButtonText = document.getElementById('submitBtnText');
const successMessage = document.getElementById('successMsg');
const successMessageText = document.getElementById('successMsgText');
const tableBody = document.getElementById('studentsTableBody');
const emptyMessage = document.getElementById('emptyStateMsg');
const countChip = document.getElementById('countChip');

const fullNameInput = document.getElementById('fullName');
const dobInput = document.getElementById('dob');
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('email');
const stateInput = document.getElementById('state');
const cityInput = document.getElementById('city');
const addressInput = document.getElementById('address');
const rollNumberInput = document.getElementById('rollNumber');
const cgpaInput = document.getElementById('cgpa');
const courseInput = document.getElementById('course');
const semesterInput = document.getElementById('semester');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const genderRadios = document.querySelectorAll('input[name="gender"]');
const genderError = document.getElementById('err-gender');

const studentRecords = [];
let editingRecordIndex = -1;
let successMessageTimerId = null;

const passwordRule = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])\S{1,10}$/;
const fieldIds = [
  'fullName',
  'rollNumber',
  'email',
  'phone',
  'dob',
  'state',
  'city',
  'course',
  'semester',
  'cgpa',
  'address',
  'password',
  'confirmPassword'
];

const LOCATION_DATA_URL = 'assets/data/Indian Cities Geo Data.csv';
const STATE_COLUMN_ALIASES = [
  'state',
  'statename',
  'stateut',
  'stateunionterritory',
  'stateorunionterritory',
  'ut',
  'utname',
  'province',
  'adminname'
];
const CITY_COLUMN_ALIASES = [
  'city',
  'location',
  'cityname',
  'citytown',
  'town',
  'district',
  'districtname',
  'name'
];
let indiaStateCityMap = {};

function showError(fieldId, message) {
  const errorElement = document.getElementById('err-' + fieldId);
  const inputElement = document.getElementById(fieldId);

  if (errorElement) {
    errorElement.textContent = message;
  }

  if (inputElement) {
    inputElement.classList.add('input-error');
  }
}

function clearError(fieldId) {
  const errorElement = document.getElementById('err-' + fieldId);
  const inputElement = document.getElementById(fieldId);

  if (errorElement) {
    errorElement.textContent = '';
  }

  if (inputElement) {
    inputElement.classList.remove('input-error');
  }
}

function clearAllErrors() {
  fieldIds.forEach(function (fieldId) {
    clearError(fieldId);
  });
  genderError.textContent = '';
}

function getSelectedGender() {
  for (const radio of genderRadios) {
    if (radio.checked) {
      return radio.value;
    }
  }
  return '';
}

function setSelectedGender(genderValue) {
  genderRadios.forEach(function (radio) {
    radio.checked = radio.value === genderValue;
  });
}

function setOptions(selectElement, placeholderText, values) {
  selectElement.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholderText;
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  selectElement.appendChild(placeholderOption);

  values.forEach(function (value) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeCityName(rawCityName) {
  const cleanedCityName = String(rawCityName || '')
    .replace(/\s*Latitude and Longitude\s*$/i, '')
    .trim();

  if (!cleanedCityName) {
    return '';
  }

  const primaryCityName = cleanedCityName.includes(',')
    ? cleanedCityName.split(',')[0].trim()
    : cleanedCityName;

  return primaryCityName.replace(/,+$/, '').trim();
}

function parseCsvRow(rowText) {
  const values = [];
  let currentValue = '';
  let inQuotes = false;

  for (let index = 0; index < rowText.length; index += 1) {
    const char = rowText[index];

    if (char === '"') {
      const nextChar = rowText[index + 1];
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
      continue;
    }

    currentValue += char;
  }

  values.push(currentValue.trim());
  return values;
}

function getColumnIndex(headers, aliases) {
  const normalizedHeaders = headers.map(function (header) {
    return normalizeHeader(header);
  });

  for (const alias of aliases) {
    const aliasIndex = normalizedHeaders.indexOf(alias);
    if (aliasIndex !== -1) {
      return aliasIndex;
    }
  }

  return -1;
}

function normalizeLocationMap(rawLocationMap) {
  const normalizedMap = {};

  if (!rawLocationMap || typeof rawLocationMap !== 'object') {
    return normalizedMap;
  }

  Object.entries(rawLocationMap).forEach(function (entry) {
    const stateName = String(entry[0] || '').trim();
    const cityList = Array.isArray(entry[1]) ? entry[1] : [];

    if (!stateName) {
      return;
    }

    const uniqueSortedCities = Array.from(
      new Set(
        cityList
          .map(function (city) {
            return String(city || '').trim();
          })
          .filter(Boolean)
      )
    ).sort(function (a, b) {
      return a.localeCompare(b);
    });

    normalizedMap[stateName] = uniqueSortedCities;
  });

  return Object.fromEntries(
    Object.entries(normalizedMap).sort(function (a, b) {
      return a[0].localeCompare(b[0]);
    })
  );
}

function parseLocationCsv(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean);

  if (lines.length < 2) {
    return {};
  }

  const headers = parseCsvRow(lines[0]);
  const stateIndex = getColumnIndex(headers, STATE_COLUMN_ALIASES);
  const cityIndex = getColumnIndex(headers, CITY_COLUMN_ALIASES);

  if (stateIndex === -1 || cityIndex === -1) {
    throw new Error('CSV must contain state and city columns.');
  }

  const stateCityMap = {};

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const rowValues = parseCsvRow(lines[lineIndex]);
    const stateName = String(rowValues[stateIndex] || '').trim();
    const cityName = normalizeCityName(rowValues[cityIndex]);

    if (!stateName || !cityName) {
      continue;
    }

    if (!stateCityMap[stateName]) {
      stateCityMap[stateName] = [];
    }

    stateCityMap[stateName].push(cityName);
  }

  return normalizeLocationMap(stateCityMap);
}

async function loadLocationData() {
  try {
    const response = await fetch(LOCATION_DATA_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to read location CSV file.');
    }

    const csvText = await response.text();
    indiaStateCityMap = parseLocationCsv(csvText);

    if (Object.keys(indiaStateCityMap).length === 0) {
      throw new Error('Location CSV file is empty.');
    }

    loadStates();
  } catch (error) {
    console.error('Failed to load location data from CSV:', LOCATION_DATA_URL, error);
    indiaStateCityMap = {};
    stateInput.disabled = true;
    cityInput.disabled = true;
    setOptions(stateInput, 'Location data unavailable (run via local server)', []);
    setOptions(cityInput, 'Location data unavailable', []);
  }
}

function loadStates() {
  const states = Object.keys(indiaStateCityMap).sort(function (a, b) {
    return a.localeCompare(b);
  });

  setOptions(stateInput, 'Select state', states);
  stateInput.disabled = states.length === 0;
  setOptions(cityInput, 'Select city', []);
  cityInput.disabled = true;
}

function loadCitiesByState(stateName) {
  const cities = indiaStateCityMap[stateName] || [];
  setOptions(cityInput, 'Select city', cities);
  cityInput.disabled = cities.length === 0;
}

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .map(function (word) {
      return word[0];
    })
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getCoursePillClass(courseName) {
  const classMap = {
    'Computer Science': 'cs',
    Mechanical: 'mech',
    Civil: 'civil',
    Electronics: 'elec'
  };
  return 'pill pill-' + (classMap[courseName] || 'gen');
}

function updateCountChip() {
  const totalRecords = studentRecords.length;
  countChip.textContent = totalRecords + ' student' + (totalRecords !== 1 ? 's' : '');
  countChip.classList.toggle('visible', totalRecords > 0);
}

function hideSuccessMessage() {
  if (successMessageTimerId) {
    clearTimeout(successMessageTimerId);
    successMessageTimerId = null;
  }
  successMessage.style.display = 'none';
}

function showSuccessMessage(message) {
  hideSuccessMessage();
  successMessageText.textContent = message;
  successMessage.style.display = 'flex';
  successMessageTimerId = setTimeout(function () {
    successMessage.style.display = 'none';
    successMessageTimerId = null;
  }, 5000);
}

function resetEditingState() {
  editingRecordIndex = -1;
  submitButtonText.textContent = 'Submit Registration';
}

function createCell(textValue) {
  const cell = document.createElement('td');
  cell.textContent = textValue;
  return cell;
}

function createNameCell(student) {
  const wrapper = document.createElement('div');
  wrapper.className = 'name-cell';

  const avatar = document.createElement('div');
  avatar.className = 'avatar-initials';
  avatar.textContent = getInitials(student.fullName);

  const nameText = document.createElement('span');
  nameText.className = 'name-text';
  nameText.textContent = student.fullName;

  wrapper.appendChild(avatar);
  wrapper.appendChild(nameText);

  const cell = document.createElement('td');
  cell.appendChild(wrapper);
  return cell;
}

function createGenderCell(gender) {
  const cell = document.createElement('td');
  const pill = document.createElement('span');
  pill.className = 'pill pill-' + gender.toLowerCase();
  pill.textContent = gender;
  cell.appendChild(pill);
  return cell;
}

function createLocationCell(city, state) {
  const cell = document.createElement('td');

  const cityLine = document.createElement('div');
  cityLine.className = 'loc-city';
  cityLine.textContent = city;

  const stateLine = document.createElement('div');
  stateLine.className = 'loc-state';
  stateLine.textContent = state;

  cell.appendChild(cityLine);
  cell.appendChild(stateLine);

  return cell;
}

function createCourseCell(course) {
  const cell = document.createElement('td');
  const pill = document.createElement('span');
  pill.className = getCoursePillClass(course);
  pill.textContent = course;
  cell.appendChild(pill);
  return cell;
}

function createActionCell(index) {
  const cell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'table-actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'row-action-btn edit';
  editButton.dataset.action = 'edit';
  editButton.dataset.index = String(index);
  editButton.textContent = 'Edit';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'row-action-btn delete';
  deleteButton.dataset.action = 'delete';
  deleteButton.dataset.index = String(index);
  deleteButton.textContent = 'Delete';

  actions.appendChild(editButton);
  actions.appendChild(deleteButton);
  cell.appendChild(actions);

  return cell;
}

function renderStudentTable() {
  tableBody.innerHTML = '';
  updateCountChip();

  if (studentRecords.length === 0) {
    emptyMessage.style.display = 'flex';
    return;
  }

  emptyMessage.style.display = 'none';

  studentRecords.forEach(function (student, index) {
    const row = document.createElement('tr');

    const serialCell = createCell(String(index + 1));
    serialCell.style.color = '#94a3b8';
    serialCell.style.fontWeight = '600';
    row.appendChild(serialCell);

    row.appendChild(createNameCell(student));

    const rollCell = createCell(String(student.rollNumber));
    rollCell.style.fontFamily = 'monospace';
    rollCell.style.fontWeight = '700';
    row.appendChild(rollCell);

    const emailCell = createCell(student.email);
    emailCell.style.color = '#475569';
    row.appendChild(emailCell);

    const phoneCell = createCell(student.phone);
    phoneCell.style.color = '#475569';
    row.appendChild(phoneCell);

    const dobCell = createCell(student.dob);
    dobCell.style.color = '#64748b';
    row.appendChild(dobCell);

    row.appendChild(createGenderCell(student.gender));
    row.appendChild(createLocationCell(student.city, student.state));
    row.appendChild(createCourseCell(student.course));

    const semesterCell = createCell('Sem ' + student.semester);
    semesterCell.style.color = '#64748b';
    row.appendChild(semesterCell);

    const cgpaCell = createCell(String(student.cgpa));
    cgpaCell.className = 'cgpa-val';
    row.appendChild(cgpaCell);

    const addressCell = createCell(student.address);
    addressCell.style.maxWidth = '160px';
    addressCell.style.whiteSpace = 'normal';
    addressCell.style.color = '#64748b';
    row.appendChild(addressCell);

    row.appendChild(createActionCell(index));

    tableBody.appendChild(row);
  });
}

function validateAndBuildStudent() {
  clearAllErrors();

  const fullName = fullNameInput.value.trim().replace(/\s+/g, ' ');
  const rollNumberText = rollNumberInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const dob = dobInput.value;
  const state = stateInput.value.trim();
  const city = cityInput.value.trim();
  const course = courseInput.value.trim();
  const semesterText = semesterInput.value.trim();
  const cgpaText = cgpaInput.value.trim();
  const address = addressInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const gender = getSelectedGender();

  let isValid = true;

  if (!fullName) {
    showError('fullName', 'Full name is required.');
    isValid = false;
  }

  if (!rollNumberText || !/^\d+$/.test(rollNumberText) || Number(rollNumberText) <= 0) {
    showError('rollNumber', 'Enter a valid roll number.');
    isValid = false;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('email', 'Enter a valid email address.');
    isValid = false;
  }

  if (!phone || !/^\d{10}$/.test(phone)) {
    showError('phone', 'Enter exactly 10 digits.');
    isValid = false;
  }

  if (!dob) {
    showError('dob', 'Date of birth is required.');
    isValid = false;
  } else {
    const selectedDate = new Date(dob + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate > today) {
      showError('dob', 'Cannot be in the future.');
      isValid = false;
    }
  }

  if (!gender) {
    genderError.textContent = 'Please select a gender.';
    isValid = false;
  }

  if (Object.keys(indiaStateCityMap).length === 0) {
    showError('state', 'Location dataset is not loaded.');
    isValid = false;
  }

  if (!state || !indiaStateCityMap[state]) {
    showError('state', 'Please select a valid state.');
    isValid = false;
  }

  if (!city || !state || !indiaStateCityMap[state] || !indiaStateCityMap[state].includes(city)) {
    showError('city', 'Please select a city.');
    isValid = false;
  }

  if (!course) {
    showError('course', 'Please select a course.');
    isValid = false;
  }

  if (!semesterText) {
    showError('semester', 'Please select a semester.');
    isValid = false;
  }

  const cgpa = parseFloat(cgpaText);
  if (!cgpaText || Number.isNaN(cgpa) || cgpa < 0 || cgpa > 10) {
    showError('cgpa', 'Enter a CGPA between 0 and 10.');
    isValid = false;
  }

  if (!address) {
    showError('address', 'Address is required.');
    isValid = false;
  }

  if (!password || !passwordRule.test(password)) {
    showError('password', 'Max 10 chars, letters + numbers + 1 special.');
    isValid = false;
  }

  if (!confirmPassword) {
    showError('confirmPassword', 'Please confirm your password.');
    isValid = false;
  } else if (confirmPassword !== password) {
    showError('confirmPassword', 'Passwords do not match.');
    isValid = false;
  }

  if (!isValid) {
    return null;
  }

  return {
    fullName: fullName,
    rollNumber: Number(rollNumberText),
    email: email,
    dob: dob,
    gender: gender,
    country: 'India',
    state: state,
    city: city,
    course: course,
    semester: Number(semesterText),
    cgpa: cgpa,
    phone: phone,
    address: address,
    password: password
  };
}

form.addEventListener('input', function (event) {
  hideSuccessMessage();

  const target = event.target;
  if (!target || !target.id) {
    return;
  }

  if (target.id === 'phone' || target.id === 'rollNumber') {
    target.value = target.value.replace(/\D/g, '');
  }

  if (target.id === 'password' || target.id === 'confirmPassword') {
    target.value = target.value.slice(0, 10);
  }

  clearError(target.id);
});

form.addEventListener('submit', function (event) {
  event.preventDefault();
  hideSuccessMessage();

  const student = validateAndBuildStudent();
  if (!student) {
    return;
  }

  const isEditing = editingRecordIndex !== -1;
  if (isEditing) {
    studentRecords[editingRecordIndex] = student;
  } else {
    studentRecords.push(student);
  }

  renderStudentTable();
  showSuccessMessage(
    isEditing ? 'Student record updated successfully.' : 'Data submitted successfully!'
  );

  resetEditingState();
  form.reset();
  loadStates();
});

tableBody.addEventListener('click', function (event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const recordIndex = Number(button.dataset.index);
  if (Number.isNaN(recordIndex) || !studentRecords[recordIndex]) {
    return;
  }

  hideSuccessMessage();

  if (button.dataset.action === 'edit') {
    const student = studentRecords[recordIndex];

    editingRecordIndex = recordIndex;
    submitButtonText.textContent = 'Update Registration';
    clearAllErrors();

    fullNameInput.value = student.fullName;
    dobInput.value = student.dob;
    phoneInput.value = student.phone;
    emailInput.value = student.email;
    setSelectedGender(student.gender);
    stateInput.value = student.state;
    loadCitiesByState(student.state);
    cityInput.value = student.city;
    addressInput.value = student.address;
    rollNumberInput.value = String(student.rollNumber);
    cgpaInput.value = String(student.cgpa);
    courseInput.value = student.course;
    semesterInput.value = String(student.semester);
    passwordInput.value = student.password;
    confirmPasswordInput.value = student.password;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (button.dataset.action === 'delete') {
    if (!confirm('Delete this student record?')) {
      return;
    }

    studentRecords.splice(recordIndex, 1);

    if (editingRecordIndex === recordIndex) {
      form.reset();
      loadStates();
      clearAllErrors();
      resetEditingState();
    } else if (editingRecordIndex > recordIndex) {
      editingRecordIndex -= 1;
    }

    renderStudentTable();
  }
});

genderRadios.forEach(function (radio) {
  radio.addEventListener('change', function () {
    genderError.textContent = '';
    hideSuccessMessage();
  });
});

stateInput.addEventListener('change', function () {
  if (stateInput.disabled) {
    return;
  }
  clearError('state');
  clearError('city');
  hideSuccessMessage();
  loadCitiesByState(stateInput.value);
});

cityInput.addEventListener('change', function () {
  if (cityInput.disabled) {
    return;
  }
  clearError('city');
  hideSuccessMessage();
});

async function initApp() {
  await loadLocationData();
  renderStudentTable();
}

initApp();
