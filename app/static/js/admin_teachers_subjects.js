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
        showTeacherSubjects: document.getElementById("showTeacherSubjects"),
        showCreateTeacherSubjects: document.getElementById("showCreateTeacherSubjects"),
        teacherSubjectsList: document.getElementById("teacherSubjectsList"),
        createTeacherSubjectsContainer: document.getElementById("createTeacherSubjectsContainer"),
        searchFio: document.getElementById("searchFio"),
        teacherSubjectsTable: document.getElementById("teacherSubjectsTable"),
        addRow: document.getElementById("addRows"),
        createTable: document.getElementById("createTable"),
        createTeacherSubjectsForm: document.getElementById("createTeacherSubjectsForm"),
        teachersDatalist: document.getElementById("teachers"),
        subjectsDatalist: document.getElementById("subjects"),
        exportExcelTeacherSubjects: document.getElementById("exportExcelTeachers")
    };


    // Состояние сортировки таблицы
    let sortState = {column: null, order: null};

    function updateSortIndicators() {
        document.querySelectorAll('#teacherSubjectsTable thead th[data-column]').forEach(th => {
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
        const tableBody = elements.teacherSubjectsTable.querySelector('tbody');
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        if (rows.length === 0) return;
        if (sortState.column === column) {
            sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.column = column;
            sortState.order = 'asc';
        }
        const columnIndex = column === 'subject' ? 0 : 1;
        rows.sort((a, b) => {
            const aValue = a.querySelector(`td:nth-child(${columnIndex + 1})`).textContent.trim();
            const bValue = b.querySelector(`td:nth-child(${columnIndex + 1})`).textContent.trim();
            return sortState.order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        });
        tableBody.innerHTML = '';
        rows.forEach(row => tableBody.appendChild(row));
        updateSortIndicators();
    }

    document.querySelectorAll('#teacherSubjectsTable thead th[data-column]').forEach(th => {
        th.addEventListener('click', () => sortTable(th.getAttribute('data-column')));
    });
    updateSortIndicators();

    // Переключение режимов отображения
    elements.showTeacherSubjects.addEventListener("click", () => {
        elements.teacherSubjectsList.style.display = "block";
        elements.createTeacherSubjectsContainer.style.display = "none";
        elements.exportExcelTeacherSubjects.style.display = "inline-block";
        elements.searchFio.style.display = "block";
        loadTeacherSubjects();
    });

    elements.showCreateTeacherSubjects.addEventListener("click", () => {
        elements.teacherSubjectsList.style.display = "none";
        elements.createTeacherSubjectsContainer.style.display = "block";
        elements.exportExcelTeacherSubjects.style.display = "none";
        elements.searchFio.style.display = "none";
        loadDropdowns();
        addRow();
    });

    elements.exportExcelTeacherSubjects.addEventListener("click", exportToExcelTeacherSubjects);

    function exportToExcelTeacherSubjects() {
        const table = document.getElementById('teacherSubjectsTable');
        const rows = table.querySelectorAll('tbody tr');
        const data = [];
        const headers = [];
        table.querySelectorAll('thead th').forEach((th, index) => {
            if (index < 2) {
                const headerText = th.textContent.replace(/[\u25B2\u25BC]/g, '').trim();
                headers.push(headerText);
            }
        });
        data.push(headers);

        rows.forEach(row => {
            const rowData = [];
            row.querySelectorAll('td').forEach((td, index) => {
                if (index < 2) rowData.push(td.textContent.trim());
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
            for (let C = 0; C < 2; ++C) {
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

        const now = new Date();
        const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
        const fileName = `Список преподавателей и их предметов на ${dateStr}.xlsx`;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Преподаватели и предметы");
        XLSX.writeFile(wb, fileName);
    }

    elements.teacherSubjectsList.style.display = "block";
    elements.exportExcelTeacherSubjects.style.display = "inline-block";
    elements.searchFio.style.display = "block";
    loadTeacherSubjects();

    // Загрузка данных для таблицы
    function loadTeacherSubjects() {
        fetchWithCookie('/auth/admin/api/teacher_subjects')
            .then(response => response.json())
            .then(data => {
                const tableBody = elements.teacherSubjectsTable.querySelector('tbody');
                tableBody.innerHTML = '';
                data.forEach(item => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.lesson}</td>
                        <td>${item.user}</td>
                        <td><button class="removeRow" data-id="${item.id}">Удалить</button></td>
                    `;
                    tableBody.appendChild(row);
                });
            });
    }

    // Загрузка данных для выпадающих списков
    let teachersList = [];
    let subjectsList = [];

    function loadDropdowns() {
        fetchWithCookie('/auth/admin/api/users')
            .then(response => response.json())
            .then(data => {
                const teachers = data.users.filter(user => user.role === 'teacher');
                const fioMap = {};
                teachers.forEach(teacher => {
                    if (!fioMap[teacher.fio]) fioMap[teacher.fio] = [];
                    fioMap[teacher.fio].push(teacher);
                });
                elements.teachersDatalist.innerHTML = '';
                Object.entries(fioMap).forEach(([fio, teachers]) => {
                    if (teachers.length === 1) {
                        const option = document.createElement('option');
                        option.value = fio;
                        elements.teachersDatalist.appendChild(option);
                    } else {
                        teachers.forEach(teacher => {
                            const option = document.createElement('option');
                            option.value = `${fio} (${teacher.mail})`;
                            elements.teachersDatalist.appendChild(option);
                        });
                    }
                });
                teachersList = teachers.map(teacher => teacher.fio);
            });

        fetchWithCookie('/auth/admin/api/subjects')
            .then(response => response.json())
            .then(data => {
                subjectsList = data;
                elements.subjectsDatalist.innerHTML = '';
                data.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject;
                    elements.subjectsDatalist.appendChild(option);
                });
            });
    }

    elements.searchFio.addEventListener('input', () => {
        const filter = elements.searchFio.value.toLowerCase();
        const rows = elements.teacherSubjectsTable.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const subject = row.cells[0].textContent.toLowerCase();
            const teacher = row.cells[1].textContent.toLowerCase();
            row.style.display = (subject.includes(filter) || teacher.includes(filter)) ? '' : 'none';
        });
    });

    // Удаление записи
    elements.teacherSubjectsTable.addEventListener('click', (e) => {
        if (e.target.classList.contains('removeRow')) {
            const id = e.target.getAttribute('data-id');
            if (confirm('Вы уверены, что хотите удалить эту запись?')) {
                fetchWithCookie(`/auth/admin/api/delete_teacher_subject/${id}`, {
                    method: 'DELETE',
                    headers: {}
                })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            loadTeacherSubjects();
                        } else {
                            alert(data.message || 'Ошибка при удалении записи');
                        }
                    });
            }
        }
    });

    // Добавление строки в форму
    function addRow() {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input list="teachers" name="teacher" placeholder="Введите преподавателя"></td>
            <td><input list="subjects" name="subject" placeholder="Введите предмет"></td>
            <td><button type="button" class="removeRow">Удалить</button></td>
        `;
        elements.createTable.querySelector('tbody').appendChild(row);
    }

    elements.addRow.addEventListener('click', addRow);

    elements.createTable.addEventListener('click', (e) => {
        if (e.target.classList.contains('removeRow')) {
            e.target.closest('tr').remove();
        }
    });

    // Проверка наличия связи
    async function checkTeacherSubjectExists(teacher, subject) {
        const response = await fetchWithCookie('/auth/admin/api/teacher_subjects');
        const teacherSubjects = await response.json();
        return teacherSubjects.some(item => item.user === teacher && item.lesson === subject);
    }

    // Обработка отправки формы
    elements.createTeacherSubjectsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rows = elements.createTable.querySelectorAll('tbody tr');
        const data = [];

        const processRow = async (row, callback) => {
            const teacherInput = row.querySelector('input[name="teacher"]');
            const subjectInput = row.querySelector('input[name="subject"]');
            const teacher = teacherInput.value.trim();
            const subject = subjectInput.value.trim();

            if (!teachersList.includes(teacher)) {
                alert(`Преподаватель "${teacher}" не найден. Добавьте его в список пользователей.`);
                return;
            }

            if (!subjectsList.includes(subject)) {
                if (confirm(`Предмет "${subject}" не найден. Добавить новый предмет?`)) {
                    const response = await fetchWithCookie('/auth/admin/api/add_subject', {
                        method: 'POST',
                        headers: {},
                        body: JSON.stringify({name: subject})
                    });
                    const respData = await response.json();
                    if (respData.success) {
                        subjectsList.push(subject);
                        const option = document.createElement('option');
                        option.value = subject;
                        elements.subjectsDatalist.appendChild(option);
                        callback();
                    } else {
                        alert(`Ошибка при добавлении предмета: ${respData.message || 'Неизвестная ошибка'}`);
                    }
                }
            } else {
                const exists = await checkTeacherSubjectExists(teacher, subject);
                if (exists) {
                    alert(`Связь между преподавателем "${teacher}" и предметом "${subject}" уже существует.`);
                    return;
                }
                data.push({teacher, subject});
                callback();
            }
        };

        let processed = 0;
        const promises = Array.from(rows).map(row => {
            return new Promise(resolve => {
                processRow(row, () => {
                    processed++;
                    resolve();
                });
            });
        });

        await Promise.all(promises);

        if (processed === rows.length && data.length > 0) {
            const response = await fetchWithCookie('/auth/admin/api/add_teacher_subjects', {
                method: 'POST',
                headers: {},
                body: JSON.stringify(data)
            });
            const respData = await response.json();
            if (respData.success) {
                alert('Данные сохранены');
                elements.createTable.querySelector('tbody').innerHTML = '';
                addRow();
            } else {
                alert(respData.message || 'Ошибка при сохранении данных');
            }
        }
    });
});
