document.addEventListener('DOMContentLoaded', () => {
    // Универсальная функция fetch с включением cookie и обработкой ошибок
    async function fetchWithCookie(url, options = {}) {
        const csrfToken = getCookie('csrf_access_token');

        // Проверка CSRF-токена для запросов, изменяющих состояние
        if (['POST', 'PUT', 'DELETE'].includes(options.method?.toUpperCase()) && !csrfToken) {
            console.error('CSRF-токен не найден');
            window.location.href = '/auth/login';
            return;
        }

        // Настройка заголовков
        const headers = {
            ...(options.headers || {}),
        };

        // Добавляем X-CSRF-TOKEN, если он есть
        if (csrfToken) {
            headers['X-CSRF-TOKEN'] = csrfToken;
        }

        // Устанавливаем Content-Type только если не указан в options и тело — строка
        if (!headers['Content-Type'] && options.body && typeof options.body === 'string') {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
            ...options,
            credentials: 'include', // Отправляем cookie
            headers: headers
        });

        // Обработка ошибок 401 и 403
        if (response.status === 401 || response.status === 403) {
            window.location.href = '/auth/login';
            throw new Error('Unauthorized или Forbidden');
        }

        return response;
    }

    // Функция чтения куки
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    // Получение ссылок на DOM-элементы
    const elements = {
        showStudents: document.getElementById("showStudents"),
        showCreateStudents: document.getElementById("showCreateStudents"),
        studentsList: document.getElementById("studentsList"),
        createStudentsContainer: document.getElementById("createStudentsContainer"),
        groupFilter: document.getElementById("groupFilter"),
        searchFio: document.getElementById("searchFio"),
        studentsTable: document.getElementById("studentsTable"),
        tableBody: document.querySelector("#studentsTable tbody"),
        groupInput: document.getElementById("groupInput"),
        nextButton: document.getElementById("nextButton"),
        groupSelection: document.getElementById("groupSelection"),
        studentForm: document.getElementById("studentForm"),
        rowCount: document.getElementById("rowCount"),
        addRows: document.getElementById("addRows"),
        createTable: document.getElementById("createTable"),
        createStudentsForm: document.getElementById("createStudentsForm"),
        groupsDatalist: document.getElementById("groups"),
        exportExcelStudents: document.getElementById("exportExcelStudents")
    };

    const loadingModal = document.getElementById('loadingModal');
    const loadingText = document.getElementById('loadingText');

    // Инициализация отображения
    elements.studentsList.style.display = "block";
    elements.exportExcelStudents.style.display = "inline-block";
    elements.searchFio.style.display = "block";
    loadGroups();
    loadStudents();

    // Автоматическое добавление тире для студенческого билета
    document.addEventListener('input', (e) => {
        if (e.target.name === 'student_id') {
            let value = e.target.value.replace(/[^0-9]/g, '');
            if (value.length > 2) {
                value = value.slice(0, 2) + '-' + value.slice(2, 7);
            } else {
                value = value.slice(0, 7);
            }
            e.target.value = value;
        }
    });


    // Состояние сортировки таблицы студентов
    let sortState = {
        column: null,
        order: null
    };

    function updateSortIndicators() {
        document.querySelectorAll('#studentsTable thead th[data-column]').forEach(th => {
            const ascIndicator = th.querySelector('.sort-indicator.asc');
            const descIndicator = th.querySelector('.sort-indicator.desc');
            const column = th.getAttribute('data-column');
            if (column === sortState.column) {
                if (sortState.order === 'asc') {
                    ascIndicator.classList.remove('transparent');
                    descIndicator.classList.add('transparent');
                } else if (sortState.order === 'desc') {
                    ascIndicator.classList.add('transparent');
                    descIndicator.classList.remove('transparent');
                }
            } else {
                ascIndicator.classList.remove('transparent');
                descIndicator.classList.remove('transparent');
            }
        });
    }

    function sortTable(column) {
        const tableBody = elements.tableBody;
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        let columnIndex;
        switch (column) {
            case 'fio':
                columnIndex = 1;
                break;
            case 'group':
                columnIndex = 2;
                break;
            default:
                return;
        }
        rows.sort((a, b) => {
            const aValue = a.cells[columnIndex].textContent.trim();
            const bValue = b.cells[columnIndex].textContent.trim();
            return sortState.order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        });
        tableBody.innerHTML = '';
        rows.forEach(row => tableBody.appendChild(row));
    }

    document.querySelectorAll('#studentsTable thead th[data-column]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.getAttribute('data-column');
            if (sortState.column === column) {
                sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.column = column;
                sortState.order = 'asc';
            }
            updateSortIndicators();
            sortTable(column);
        });
    });

    updateSortIndicators();

    // Переменные для работы с группами
    let selectedGroupId = null;
    let groupsList = [];

    // Переключение режимов отображения
    elements.showStudents.addEventListener("click", () => {
        elements.studentsList.style.display = "block";
        elements.createStudentsContainer.style.display = "none";
        elements.exportExcelStudents.style.display = "inline-block";
        elements.searchFio.style.display = "block";
        loadGroups();
        loadStudents();
    });

    elements.showCreateStudents.addEventListener("click", () => {
        elements.studentsList.style.display = "none";
        elements.createStudentsContainer.style.display = "block";
        elements.groupSelection.style.display = "block";
        elements.studentForm.style.display = "none";
        elements.exportExcelStudents.style.display = "none";
        elements.searchFio.style.display = "none";
        loadGroupsForDatalist();
    });

    elements.exportExcelStudents.addEventListener("click", exportToExcelStudents);

    function exportToExcelStudents() {
        const table = document.getElementById('studentsTable');
        const rows = table.querySelectorAll('tbody tr');
        const data = [];
        const headers = [];
        table.querySelectorAll('thead th').forEach((th, index) => {
            if (index < 5) {
                const headerText = th.textContent.replace(/[\u25B2\u25BC]/g, '').trim();
                headers.push(headerText);
            }
        });
        data.push(headers);

        rows.forEach(row => {
            const rowData = [];
            row.querySelectorAll('td').forEach((td, index) => {
                if (index < 5) {
                    rowData.push(td.textContent.trim());
                }
            });
            data.push(rowData);
        });

        const ws = XLSX.utils.aoa_to_sheet(data);
        const titleCell = "A1";
        if (ws[titleCell]) {
            ws[titleCell].s = {font: {bold: true}, alignment: {horizontal: "center"}};
        }
        ws['!cols'] = headers.map((header, colIndex) => {
            const maxLength = Math.max(...data.slice(1).map(row => (row[colIndex] || '').length), header.length);
            return {wch: maxLength + 2};
        });

        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = 1; R <= range.e.r; ++R) {
            for (let C = 0; C < 5; ++C) {
                const cellAddress = XLSX.utils.encode_cell({r: R, c: C});
                if (!ws[cellAddress]) continue;
                ws[cellAddress].s = {
                    border: {
                        top: {style: "thin", color: {rgb: "000000"}},
                        bottom: {style: "thin", color: {rgb: "000000"}},
                        left: {style: "thin", color: {rgb: "000000"}},
                        right: {style: "thin", color: {rgb: "000000"}}
                    }
                };
            }
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Студенты");
        XLSX.writeFile(wb, `Список студентов на ${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    // Загрузка списка групп
    function loadGroups() {
        fetchWithCookie('/auth/admin/api/groups')
            .then(response => response.json())
            .then(data => {
                groupsList = data;
                elements.groupFilter.innerHTML = '<option value="">Все группы</option>';
                data.forEach(group => {
                    const option = document.createElement('option');
                    option.value = group.id;
                    option.textContent = group.groupname;
                    elements.groupFilter.appendChild(option);
                });
            });
    }

    function loadGroupsForDatalist() {
        fetchWithCookie('/auth/admin/api/groups')
            .then(response => response.json())
            .then(data => {
                elements.groupsDatalist.innerHTML = '';
                data.forEach(group => {
                    const option = document.createElement('option');
                    option.value = group.groupname;
                    elements.groupsDatalist.appendChild(option);
                });
            });
    }

    // Загрузка списка студентов
    function loadStudents() {
        const groupId = elements.groupFilter.value;
        fetchWithCookie(`/auth/admin/api/students?group_id=${groupId || ''}`)
            .then(response => response.json())
            .then(data => {
                const tableBody = elements.studentsTable.querySelector('tbody');
                tableBody.innerHTML = '';
                data.forEach(student => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${student.student_id_display}</td>
                        <td>${student.fio}</td>
                        <td>${student.group}</td>
                        <td>${student.mail}</td>
                        <td>${student.birth_date}</td>
                        <td><button class="removeRow" data-id="${student.id}">Удалить</button></td>
                    `;
                    tableBody.appendChild(row);
                });
            });
    }

    // Удаление студента
    elements.studentsTable.addEventListener('click', (e) => {
        if (e.target.classList.contains('removeRow')) {
            const id = e.target.getAttribute('data-id');
            if (confirm('Вы уверены, что хотите удалить этого студента?')) {
                fetchWithCookie(`/auth/admin/api/delete_student/${id}`, {
                    method: 'DELETE',
                    headers: {}
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            loadStudents();
                        } else {
                            alert(data.message || 'Ошибка при удалении студента');
                        }
                    });
            }
        }
    });

    elements.groupFilter.addEventListener('change', loadStudents);

    elements.searchFio.addEventListener('input', () => {
        const filter = elements.searchFio.value.toLowerCase();
        const rows = elements.studentsTable.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const fio = row.cells[1].textContent.toLowerCase();
            row.style.display = fio.includes(filter) ? '' : 'none';
        });
    });

    // Обработка кнопки "Далее" для выбора группы
    elements.nextButton.addEventListener('click', () => {
        const groupName = elements.groupInput.value.trim();
        if (!groupName) {
            alert('Пожалуйста, выберите или введите группу');
            return;
        }

        const existingGroup = groupsList.find(group => group.groupname.toLowerCase() === groupName.toLowerCase());
        if (existingGroup) {
            selectedGroupId = existingGroup.id;
            showStudentForm();
        } else {
            if (confirm(`Группа "${groupName}" не найдена. Создать новую группу?`)) {
                if (groupName.length > 10) {
                    alert('Название группы не должно превышать 10 символов');
                    return;
                }
                // Используем fetch с cookie; XMLHttpRequest заменён на fetch
                fetchWithCookie('/auth/admin/api/add_group', {
                    method: 'POST',
                    headers: {},
                    body: JSON.stringify({groupname: groupName})
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            selectedGroupId = data.id;
                            groupsList.push({id: data.id, groupname: groupName});
                            const option = document.createElement('option');
                            option.value = groupName;
                            elements.groupsDatalist.appendChild(option);
                            showStudentForm();
                        } else {
                            alert(data.message || 'Не удалось создать группу');
                        }
                    });
            }
        }
    });

    // Показ формы добавления студентов
    function showStudentForm() {
        elements.groupSelection.style.display = "none";
        elements.studentForm.style.display = "block";
        const tbody = elements.createTable.querySelector('tbody');
        tbody.innerHTML = '';

        const today = new Date().toISOString().split('T')[0];
        const minDate = new Date();
        minDate.setFullYear(minDate.getFullYear() - 120);
        const minDateString = minDate.toISOString().split('T')[0];

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" name="student_id" placeholder="21-01087" pattern="\\d{2}-\\d{5}" maxlength="8" required></td>
            <td>
                <select name="education_form" required>
                    <option value="бюджетная">Бюджетная</option>
                    <option value="внебюджетная">Внебюджетная</option>
                </select>
            </td>
            <td><input type="text" name="fio" placeholder="ФИО" required></td>
            <td><input type="email" name="mail" placeholder="Почта" required></td>
            <td><input type="date" name="birth_date" min="${minDateString}" max="${today}" required></td>
            <td><input type="file" name="photo" accept="image/png, image/jpeg" required></td>
            <td><button type="button" class="removeRow button">Удалить</button></td>
        `;
        tbody.appendChild(row);
    }

    // Добавление строк в форму
    function addRow() {
        const count = parseInt(elements.rowCount.value) || 1;
        const tbody = elements.createTable.querySelector('tbody');
        const today = new Date().toISOString().split('T')[0];
        const minDate = new Date();
        minDate.setFullYear(minDate.getFullYear() - 120);
        const minDateString = minDate.toISOString().split('T')[0];

        for (let i = 0; i < count; i++) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="text" name="student_id" placeholder="21-01087" pattern="\\d{2}-\\d{5}" maxlength="8" required></td>
                <td>
                    <select name="education_form" required>
                        <option value="бюджетная">Бюджетная</option>
                        <option value="внебюджетная">Внебюджетная</option>
                    </select>
                </td>
                <td><input type="text" name="fio" placeholder="ФИО" required></td>
                <td><input type="email" name="mail" placeholder="Почта" required></td>
                <td><input type="date" name="birth_date" min="${minDateString}" max="${today}" required></td>
                <td><input type="file" name="photo" accept="image/png, image/jpeg" required></td>
                <td><button type="button" class="removeRow button">Удалить</button></td>
            `;
            tbody.appendChild(row);
        }
    }

    elements.addRows.addEventListener('click', addRow);

    elements.createTable.addEventListener('click', (e) => {
        if (e.target.classList.contains('removeRow')) {
            e.target.closest('tr').remove();
        }
    });

    // Отправка формы добавления студентов
    elements.createStudentsForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const rows = elements.createTable.querySelectorAll('tbody tr');
        let studentIds = new Set();
        let emails = new Set();
        let duplicates = false;

        rows.forEach((row) => {
            const student_id = row.querySelector('input[name="student_id"]').value.trim();
            const email = row.querySelector('input[name="mail"]').value.trim();
            if (studentIds.has(student_id)) {
                alert(`Ошибка: Студенческий билет ${student_id} уже используется в форме!`);
                duplicates = true;
            } else {
                studentIds.add(student_id);
            }
            if (emails.has(email)) {
                alert(`Ошибка: Почта ${email} уже используется в форме!`);
                duplicates = true;
            } else {
                emails.add(email);
            }
        });

        if (duplicates) return;

        const formData = new FormData();
        formData.append('group_id', selectedGroupId);

        rows.forEach((row, index) => {
            const student_id = row.querySelector('input[name="student_id"]').value.replace('-', '');
            const education_form = row.querySelector('select[name="education_form"]').value;
            const fio = row.querySelector('input[name="fio"]').value;
            const mail = row.querySelector('input[name="mail"]').value;
            const birth_date = row.querySelector('input[name="birth_date"]').value;
            const photo = row.querySelector('input[name="photo"]').files[0];

            formData.append(`students[${index}][student_id]`, student_id);
            formData.append(`students[${index}][education_form]`, education_form);
            formData.append(`students[${index}][fio]`, fio);
            formData.append(`students[${index}][mail]`, mail);
            formData.append(`students[${index}][birth_date]`, birth_date);
            formData.append(`students[${index}][photo]`, photo);
        });

        // Сначала проверяем дубликаты
        const xhrCheck = new XMLHttpRequest();
        xhrCheck.open('POST', '/auth/admin/api/check_duplicates', true);
        xhrCheck.withCredentials = true;

        xhrCheck.onreadystatechange = function () {
            if (xhrCheck.readyState === XMLHttpRequest.DONE) {
                if (xhrCheck.status === 200) {
                    const response = JSON.parse(xhrCheck.responseText);
                    if (response.success) {
                        loadingText.textContent = 'Загрузка данных для обработки...';
                        loadingModal.style.display = 'block';
                        document.body.classList.add('modal-open');

                        let animationIndex = 0;
                        const animationFrames = ['.', '..', '...'];
                        let animationInterval = setInterval(() => {
                            loadingText.textContent = `Происходит кодирование фотографий. Процесс может занять несколько минут, пожалуйста, подождите ${animationFrames[animationIndex]}`;
                            animationIndex = (animationIndex + 1) % animationFrames.length;
                        }, 1000);

                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', '/auth/admin/api/add_students', true);
                        xhr.withCredentials = true;

                        xhr.onreadystatechange = function () {
                            if (xhr.readyState === XMLHttpRequest.DONE) {
                                clearInterval(animationInterval);
                                loadingModal.style.display = 'none';
                                document.body.classList.remove('modal-open');

                                if (xhr.status === 200) {
                                    const response = JSON.parse(xhr.responseText);
                                    if (response.success) {
                                        elements.createTable.querySelector('tbody').innerHTML = '';
                                        alert('Студенты добавлены');
                                    } else {
                                        alert(response.message || 'Ошибка при добавлении');
                                    }
                                } else if (xhr.status === 401) {
                                    window.location.href = '/auth/login';
                                } else {
                                    alert('Ошибка при отправке данных.');
                                }
                            }
                        };
                        xhr.send(formData);
                    } else {
                        alert(response.message || 'Ошибка при проверке');
                    }
                } else if (xhrCheck.status === 401) {
                    window.location.href = '/auth/login';
                } else {
                    const response = JSON.parse(xhrCheck.responseText);
                    alert(response.message || 'Ошибка при проверке дубликатов');
                }
            }
        };
        xhrCheck.send(formData);
    });
});
