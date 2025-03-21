document.addEventListener("DOMContentLoaded", function () {
    // ============================================
    // Получение ссылок на DOM-элементы
    // ============================================
    const teacherFilter = document.getElementById("teacherFilter");
    const lessonFilter = document.getElementById("lessonFilter");
    const groupFilter = document.getElementById("groupFilter");
    const dateFromFilter = document.getElementById("dateFrom");
    const dateToFilter = document.getElementById("dateTo");
    const exportButton = document.getElementById("exportButton");
    const attendanceTables = document.getElementById("attendanceTables");

    // Текущее состояние данных (для экспорта и обновления таблиц)
    let currentData = null;
    // Глобальный список всех преподавателей (для вывода почты при одинаковых ФИО)
    let allTeachers = [];

    // ============================================
    // Универсальная функция для обновления выпадающих списков
    // ============================================
    function updateSelectOptions(selectElement, options, defaultLabel) {
        const currentValue = selectElement.value; // Запоминаем текущее значение
        // Очищаем список и добавляем пункт по умолчанию
        selectElement.innerHTML = `<option value="">${defaultLabel}</option>`;
        // Если это селект преподавателей, добавляем почту при дубликатах ФИО
        if (selectElement.id === "teacherFilter") {
            let fioCount = {};
            options.forEach(option => {
                let fio = option.fio.trim();
                fioCount[fio] = (fioCount[fio] || 0) + 1;
            });
            options.forEach(option => {
                let displayText = option.fio;
                if (fioCount[option.fio.trim()] > 1) {
                    displayText += ` (${option.mail})`;
                }
                selectElement.innerHTML += `<option value="${option.id}">${displayText}</option>`;
            });
            // Сохраняем глобально список всех преподавателей
            allTeachers = options;
        } else {
            // Для остальных селектов используем стандартное отображение
            options.forEach(option => {
                // Предполагается, что для них используется option.name
                selectElement.innerHTML += `<option value="${option.id}">${option.name}</option>`;
            });
        }
        // Восстанавливаем текущее значение, если оно присутствует в новом списке
        if (currentValue && options.some(opt => opt.id == currentValue)) {
            selectElement.value = currentValue;
        } else {
            selectElement.value = "";
        }
    }

    // ============================================
    // Функции для загрузки данных с сервера
    // ============================================
    function loadAllTeachers() {
        return fetch('/auth/admin/api/get_all_teachers')
            .then(response => response.json())
            .then(teachers => {
                updateSelectOptions(teacherFilter, teachers, "Все преподаватели");
            })
            .catch(error => console.error('Ошибка загрузки преподавателей:', error));
    }

    function loadAllLessons() {
        return fetch('/auth/admin/api/get_all_lessons')
            .then(response => response.json())
            .then(lessons => {
                updateSelectOptions(lessonFilter, lessons, "Все предметы");
            })
            .catch(error => console.error('Ошибка загрузки предметов:', error));
    }

    function loadAllGroups() {
        return fetch('/auth/admin/api/get_all_groups')
            .then(response => response.json())
            .then(groups => {
                updateSelectOptions(groupFilter, groups, "Все группы");
            })
            .catch(error => console.error('Ошибка загрузки групп:', error));
    }

    // ============================================
    // Функции обновления списков в зависимости от выбранного фильтра
    // ============================================
    function updateLessonsByTeacher() {
        const teacherId = teacherFilter.value;
        if (teacherId) {
            return fetch(`/auth/admin/api/get_lessons_by_teacher?teacher_id=${teacherId}`)
                .then(response => response.json())
                .then(lessons => {
                    updateSelectOptions(lessonFilter, lessons, "Все предметы");
                })
                .catch(error => console.error('Ошибка в updateLessonsByTeacher:', error));
        } else {
            return loadAllLessons();
        }
    }

    function updateGroupsByTeacher() {
        const teacherId = teacherFilter.value;
        if (teacherId) {
            return fetch(`/auth/admin/api/get_groups_by_teacher?teacher_id=${teacherId}`)
                .then(response => response.json())
                .then(groups => {
                    updateSelectOptions(groupFilter, groups, "Все группы");
                })
                .catch(error => console.error('Ошибка в updateGroupsByTeacher:', error));
        } else {
            return loadAllGroups();
        }
    }

    function updateGroupsByLesson() {
        const lessonId = lessonFilter.value;
        if (lessonId) {
            return fetch(`/auth/admin/api/get_groups_by_lesson?lesson_id=${lessonId}`)
                .then(response => response.json())
                .then(groups => {
                    updateSelectOptions(groupFilter, groups, "Все группы");
                })
                .catch(error => console.error('Ошибка в updateGroupsByLesson:', error));
        } else {
            return loadAllGroups();
        }
    }

    function updateLessonsByGroup() {
        const groupId = groupFilter.value;
        if (groupId) {
            return fetch(`/auth/admin/api/get_lessons_by_group?group_id=${groupId}`)
                .then(response => response.json())
                .then(lessons => {
                    updateSelectOptions(lessonFilter, lessons, "Все предметы");
                })
                .catch(error => console.error('Ошибка в updateLessonsByGroup:', error));
        } else {
            return loadAllLessons();
        }
    }

    function updateTeachersByGroup() {
        const groupId = groupFilter.value;
        if (groupId) {
            return fetch(`/auth/admin/api/get_teachers_by_group?group_id=${groupId}`)
                .then(response => response.json())
                .then(teachers => {
                    updateSelectOptions(teacherFilter, teachers, "Все преподаватели");
                })
                .catch(error => console.error('Ошибка в updateTeachersByGroup:', error));
        } else {
            return loadAllTeachers();
        }
    }

    function updateTeachersByLesson() {
        const lessonId = lessonFilter.value;
        if (lessonId) {
            return fetch(`/auth/admin/api/get_teachers_by_lesson?lesson_id=${lessonId}`)
                .then(response => response.json())
                .then(teachers => {
                    updateSelectOptions(teacherFilter, teachers, "Все преподаватели");
                })
                .catch(error => console.error('Ошибка в updateTeachersByLesson:', error));
        } else {
            return loadAllTeachers();
        }
    }

    // ============================================
    // Функция для применения фильтров и загрузки данных
    // ============================================
    function applyFilters() {
        // Получаем значения всех фильтров
        const teacherId = teacherFilter.value || "";
        const lessonId = lessonFilter.value || "";
        const groupId = groupFilter.value || "";
        const dateFrom = dateFromFilter.value || "";
        const dateTo = dateToFilter.value || "";

        // Формируем параметры запроса
        const params = new URLSearchParams({
            teacher_id: teacherId,
            lesson_id: lessonId,
            group_id: groupId,
            date_from: dateFrom,
            date_to: dateTo,
            format: "json"
        });

        fetch(`/auth/admin/dashboard?${params.toString()}`)
            .then(response => response.json())
            .then(data => {
                attendanceTables.innerHTML = "";
                currentData = data;

                if (data.message) {
                    attendanceTables.innerHTML = `<p>${data.message}</p>`;
                    return;
                }

                // Сортируем данные по преподавателю, предмету и группе
                data.attendance_by_group.sort((a, b) => {
                    if (a.teacher_fio < b.teacher_fio) return -1;
                    if (a.teacher_fio > b.teacher_fio) return 1;
                    if (a.lesson_name < b.lesson_name) return -1;
                    if (a.lesson_name > b.lesson_name) return 1;
                    if (a.groupname < b.groupname) return -1;
                    if (a.groupname > b.groupname) return 1;
                    return 0;
                });

                // Для каждой группы создаём блок с таблицей посещаемости
                data.attendance_by_group.forEach(groupData => {
                    // Если у преподавателей одинаковые ФИО, добавляем почту в скобках
                    let teacherDisplay = groupData.teacher_fio;
                    if (allTeachers.length > 0) {
                        const teacherObj = allTeachers.find(t => t.fio.trim() === groupData.teacher_fio.trim());
                        if (teacherObj) {
                            // Если одинаковых записей больше одной, добавляем почту
                            let duplicateCount = allTeachers.filter(t => t.fio.trim() === teacherObj.fio.trim()).length;
                            if (duplicateCount > 1) {
                                teacherDisplay += ` (${teacherObj.mail})`;
                            }
                        }
                    }

                    // Создаём заголовок с информацией о преподавателе (с почтой, если есть), предмете и группе
                    const groupBlock = document.createElement("div");
                    groupBlock.className = "group-block";
                    groupBlock.innerHTML = `
                        <h3>Преподаватель: ${teacherDisplay}</h3>
                        <h3>Предмет: ${groupData.lesson_name}</h3>
                        <h3>Группа: ${groupData.groupname}</h3>
                    `;

                    // Создаём таблицу для посещаемости
                    const table = document.createElement("table");
                    table.className = "attendance-table";

                    // Формируем заголовок таблицы с датами
                    const thead = document.createElement("thead");
                    thead.innerHTML = `<tr><th>ФИО студента</th>` + groupData.dates.map(date => `<th>${date}</th>`).join("") + `</tr>`;
                    table.appendChild(thead);

                    // Формируем тело таблицы со списком студентов и их посещаемостью
                    const tbody = document.createElement("tbody");
                    groupData.students.forEach(student => {
                        const tr = document.createElement("tr");
                        tr.innerHTML = `<td>${student.fio}</td>` + groupData.dates.map(date => {
                            const status = student.attendance[date] || "✖";
                            const colorClass = status === "✔" ? "present" : "absent";
                            return `<td class="attendance-status ${colorClass}">${status}</td>`;
                        }).join("");
                        tbody.appendChild(tr);
                    });
                    table.appendChild(tbody);

                    groupBlock.appendChild(table);
                    attendanceTables.appendChild(groupBlock);
                });
            })
            .catch(error => {
                console.error("Ошибка при загрузке данных:", error);
                attendanceTables.innerHTML = `<p>Произошла ошибка при загрузке данных.</p>`;
            });
    }

    // ============================================
    // Изначальная загрузка данных
    // ============================================
    Promise.all([loadAllTeachers(), loadAllLessons(), loadAllGroups()]).then(() => {
        applyFilters(); // Загружаем данные по умолчанию
    });

    // ============================================
    // Обработчики событий для динамического обновления фильтров
    // ============================================
    teacherFilter.addEventListener("change", () => {
        Promise.all([updateLessonsByTeacher(), updateGroupsByTeacher()]).then(() => applyFilters());
    });
    lessonFilter.addEventListener("change", () => {
        Promise.all([updateTeachersByLesson(), updateGroupsByLesson()]).then(() => applyFilters());
    });
    groupFilter.addEventListener("change", () => {
        Promise.all([updateLessonsByGroup(), updateTeachersByGroup()]).then(() => applyFilters());
    });
    dateFromFilter.addEventListener("change", applyFilters);
    dateToFilter.addEventListener("change", applyFilters);
    exportButton.addEventListener("click", exportToExcel);

    // ============================================
    // Функция для экспорта данных в Excel
    // ============================================
    function exportToExcel() {
        if (!currentData || currentData.message) {
            alert("Нет данных для выгрузки.");
            return;
        }
        const wb = XLSX.utils.book_new();
        const subjectsMap = new Map();

        currentData.attendance_by_group.forEach(groupData => {
            const lessonName = groupData.lesson_name;
            if (!subjectsMap.has(lessonName)) {
                subjectsMap.set(lessonName, []);
            }
            const sheetData = subjectsMap.get(lessonName);

            // Определяем отображаемое имя преподавателя с почтой, если есть дубликаты ФИО
            let teacherDisplay = groupData.teacher_fio;
            if (allTeachers && allTeachers.length > 0) {
                const teacherObj = allTeachers.find(t => t.fio.trim() === groupData.teacher_fio.trim());
                if (teacherObj) {
                    // Если одинаковых записей больше одной, добавляем почту
                    let duplicateCount = allTeachers.filter(t => t.fio.trim() === teacherObj.fio.trim()).length;
                    if (duplicateCount > 1 && teacherObj.mail) {
                        teacherDisplay += ` (${teacherObj.mail})`;
                    }
                }
            }

            // Формирование заголовков для листа
            sheetData.push([`Преподаватель: ${teacherDisplay}`]);
            sheetData.push([`Предмет: ${lessonName}`]);
            sheetData.push([`Группа: ${groupData.groupname}`]);
            sheetData.push([]);
            const header = ["ФИО студента"].concat(groupData.dates);
            sheetData.push(header);

            // Добавляем данные о студентах и их посещаемости
            groupData.students.forEach(student => {
                const row = [student.fio];
                groupData.dates.forEach(date => {
                    row.push(student.attendance[date] || "✖");
                });
                sheetData.push(row);
            });
            sheetData.push([]);
        });

        // Формирование листов и настройка ширины столбцов
        subjectsMap.forEach((ws_data, lessonName) => {
            const ws = XLSX.utils.aoa_to_sheet(ws_data);
            let colWidths = [];
            for (let R = 0; R < ws_data.length; R++) {
                let row = ws_data[R];
                for (let C = 0; C < row.length; C++) {
                    let cellValue = row[C] ? String(row[C]) : "";
                    let width = cellValue.length;
                    colWidths[C] = Math.max(colWidths[C] || 10, width);
                }
            }
            ws['!cols'] = colWidths.map(w => ({wch: w + 2}));
            XLSX.utils.book_append_sheet(wb, ws, lessonName.substring(0, 31));
        });

        // Генерация имени файла с текущей датой и временем
        const now = new Date();
        const dateStr = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
        const fileName = `Посещаемость на ${dateStr}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }
});
