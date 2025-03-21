document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // Получение ссылок на DOM-элементы
    // ============================================
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

    // ============================================
    // Получение CSRF-токена
    // ============================================
    const csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content");

    // ============================================
    // Состояние сортировки таблицы
    // ============================================
    let sortState = {
        column: null,
        order: null
    };

    // ============================================
    // Функция обновления индикаторов сортировки
    // ============================================
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

    // ============================================
    // Функция сортировки таблицы
    // ============================================
    function sortTable(column) {
        const tableBody = elements.teacherSubjectsTable.querySelector('tbody');
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        if (rows.length === 0) {
            console.log('Нет данных для сортировки');
            return;
        }
        if (sortState.column === column) {
            sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.column = column;
            sortState.order = 'asc';
        }
        const columnIndex = column === 'subject' ? 0 : 1; // Предмет — 0, ФИО — 1
        rows.sort((a, b) => {
            const aValue = a.querySelector(`td:nth-child(${columnIndex + 1})`).textContent.trim();
            const bValue = b.querySelector(`td:nth-child(${columnIndex + 1})`).textContent.trim();
            return sortState.order === 'asc'
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        });
        tableBody.innerHTML = '';
        rows.forEach(row => tableBody.appendChild(row));
        updateSortIndicators();
    }

    // ============================================
    // Обработчики кликов на заголовки столбцов таблицы
    // ============================================
    document.querySelectorAll('#teacherSubjectsTable thead th[data-column]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.getAttribute('data-column');
            sortTable(column);
        });
    });

    // ============================================
    // Инициализация индикаторов сортировки
    // ============================================
    updateSortIndicators();

    // ============================================
    // Переключение режимов: "Просмотр" и "Создание"
    // ============================================
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

    // ============================================
    // Экспорт данных в Excel
    // ============================================
    elements.exportExcelTeacherSubjects.addEventListener("click", exportToExcelTeacherSubjects);

    function exportToExcelTeacherSubjects() {
        const table = document.getElementById('teacherSubjectsTable');
        const rows = table.querySelectorAll('tbody tr');
        const data = [];

        // Собираем заголовки столбцов (берём только первые два столбца, без символов сортировки)
        const headers = [];
        table.querySelectorAll('thead th').forEach((th, index) => {
            if (index < 2) {
                const headerText = th.textContent.replace(/[\u25B2\u25BC]/g, '').trim();
                headers.push(headerText);
            }
        });
        data.push(headers);

        // Собираем данные строк (берем только первые два столбца)
        rows.forEach(row => {
            const rowData = [];
            row.querySelectorAll('td').forEach((td, index) => {
                if (index < 2) {
                    rowData.push(td.textContent.trim());
                }
            });
            data.push(rowData);
        });

        // Создаем рабочий лист из массива данных
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Применяем стили к заголовку (ячейка A1)
        const titleCell = "A1";
        if (ws[titleCell]) {
            ws[titleCell].s = {
                font: {bold: true},
                alignment: {horizontal: "center"}
            };
        }

        // Настраиваем ширину столбцов
        const colWidths = headers.map((header, colIndex) => {
            const maxLength = Math.max(
                ...data.slice(1).map(row => (row[colIndex] || '').length),
                header.length
            );
            return {wch: maxLength + 2};
        });
        ws['!cols'] = colWidths;

        // Добавляем черные тонкие границы для ячеек с данными (начиная со второй строки)
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

        // Формируем имя файла с датой скачивания
        const now = new Date();
        const dateStr = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0') + '-' + now.getDate().toString().padStart(2, '0');
        const fileName = `Список преподавателей и их предметов на ${dateStr}.xlsx`;

        // Создаем рабочую книгу и сохраняем файл
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Преподаватели и предметы");
        XLSX.writeFile(wb, fileName);
    }

    // ============================================
    // Инициализация: показываем таблицу просмотра
    // ============================================
    elements.teacherSubjectsList.style.display = "block";
    elements.exportExcelTeacherSubjects.style.display = "inline-block";
    elements.searchFio.style.display = "block";
    loadTeacherSubjects();

    // ============================================
    // Загрузка данных для таблицы просмотра
    // ============================================
    function loadTeacherSubjects() {
        fetch('/auth/admin/api/teacher_subjects')
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

    // ============================================
    // Загрузка данных для выпадающих списков (преподаватели и предметы)
    // ============================================
    let teachersList = [];
    let subjectsList = [];

    function loadDropdowns() {
            // Преподаватели (пользователи с ролью 'teacher')
    fetch('/auth/admin/api/users')
        .then(response => response.json())
        .then(data => {
            const teachers = data.users.filter(user => user.role === 'teacher');
            const fioMap = {};

            // Группируем преподавателей по ФИО
            teachers.forEach(teacher => {
                if (!fioMap[teacher.fio]) {
                    fioMap[teacher.fio] = [];
                }
                fioMap[teacher.fio].push(teacher);
            });

            elements.teachersDatalist.innerHTML = '';
            Object.entries(fioMap).forEach(([fio, teachers]) => {
                if (teachers.length === 1) {
                    // Если ФИО уникально, добавляем просто ФИО
                    const option = document.createElement('option');
                    option.value = fio;
                    elements.teachersDatalist.appendChild(option);
                } else {
                    // Если есть дубликаты, добавляем ФИО с email в скобках
                    teachers.forEach(teacher => {
                        const option = document.createElement('option');
                        option.value = `${fio} (${teacher.mail})`;
                        elements.teachersDatalist.appendChild(option);
                    });
                }
            });

            // Сохраняем список преподавателей для дальнейшего использования
            teachersList = teachers.map(teacher => teacher.fio);
        })
        .catch(error => console.error('Ошибка при загрузке преподавателей:', error));

        // Предметы
        fetch('/auth/admin/api/subjects')
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

    // ============================================
    // Поиск по таблице
    // ============================================
    elements.searchFio.addEventListener('input', () => {
        const filter = elements.searchFio.value.toLowerCase();
        const rows = elements.teacherSubjectsTable.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const subject = row.cells[0].textContent.toLowerCase();
            const teacher = row.cells[1].textContent.toLowerCase();
            row.style.display = (subject.includes(filter) || teacher.includes(filter)) ? '' : 'none';
        });
    });

    // ============================================
    // Удаление записи из таблицы
    // ============================================
    elements.teacherSubjectsTable.addEventListener('click', (e) => {
        if (e.target.classList.contains('removeRow')) {
            const id = e.target.getAttribute('data-id');
            if (confirm('Вы уверены, что хотите удалить эту запись?')) {
                fetch(`/auth/admin/api/delete_teacher_subject/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'X-CSRFToken': csrfToken
                    }
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

    // ============================================
    // Добавление строки в форму создания
    // ============================================
    function addRow() {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input list="teachers" name="teacher" placeholder="Введите преподавателя"></td>
            <td><input list="subjects" name="subject" placeholder="Введите предмет"></td>
            <td><button type="button" class="removeRow">Удалить</button></td>
        `;
        elements.createTable.querySelector('tbody').appendChild(row);
    }

    elements.addRow.addEventListener('click', () => {
        addRow();
    });

    // ============================================
    // Удаление строки из формы
    // ============================================
    elements.createTable.addEventListener('click', (e) => {
        if (e.target.classList.contains('removeRow')) {
            e.target.closest('tr').remove();
        }
    });

    // ============================================
    // Проверка наличия связи "преподаватель-урок" в базе данных
    // ============================================
    async function checkTeacherSubjectExists(teacher, subject) {
        try {
            const response = await fetch('/auth/admin/api/teacher_subjects');
            const teacherSubjects = await response.json();
            return teacherSubjects.some(item => item.user === teacher && item.lesson === subject);
        } catch (error) {
            console.error('Ошибка при проверке связи:', error);
            return false;
        }
    }

    // ============================================
    // Обработка отправки формы создания с динамической обработкой отсутствующих предметов
    // ============================================
    elements.createTeacherSubjectsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rows = elements.createTable.querySelectorAll('tbody tr');
        const data = [];

        // Функция для проверки и обработки одной строки
        const processRow = async (row, callback) => {
            const teacherInput = row.querySelector('input[name="teacher"]');
            const subjectInput = row.querySelector('input[name="subject"]');
            const teacher = teacherInput.value.trim();
            const subject = subjectInput.value.trim();

            // Проверка преподавателя
            if (!teachersList.includes(teacher)) {
                alert(`Преподаватель "${teacher}" не найден. Добавьте его в список пользователей.`);
                return;
            }

            // Проверка предмета
            if (!subjectsList.includes(subject)) {
                if (confirm(`Предмет "${subject}" не найден. Добавить новый предмет?`)) {
                    try {
                        const response = await fetch('/auth/admin/api/add_subject', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRFToken': csrfToken
                            },
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
                    } catch (error) {
                        console.error('Ошибка:', error);
                        alert('Ошибка при добавлении предмета');
                    }
                } else {
                    return;
                }
            } else {
                // Проверка наличия связи "преподаватель-урок"
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
            console.log('Отправляем данные:', JSON.stringify(data));
            try {
                const response = await fetch('/auth/admin/api/add_teacher_subjects', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken
                    },
                    body: JSON.stringify(data)
                });
                const respData = await response.json();
                if (respData.success) {
                    alert('Данные сохранены');
                    elements.createTable.querySelector('tbody').innerHTML = '';
                    addRow(); // Добавляем новую пустую строку после успешного сохранения
                } else {
                    alert(respData.message || 'Ошибка при сохранении данных');
                }
            } catch (error) {
                console.error('Ошибка:', error);
                alert('Ошибка при сохранении данных');
            }
        }
    });
});