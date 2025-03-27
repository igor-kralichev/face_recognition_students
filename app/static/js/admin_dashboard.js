document.addEventListener("DOMContentLoaded", function () {
    // Универсальная функция fetch, которая отправляет запрос с включением cookie
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
    const teacherFilter = document.getElementById("teacherFilter");
    const lessonFilter = document.getElementById("lessonFilter");
    const groupFilter = document.getElementById("groupFilter");
    const dateFromFilter = document.getElementById("dateFrom");
    const dateToFilter = document.getElementById("dateTo");
    const exportButton = document.getElementById("exportButton");
    const attendanceTables = document.getElementById("attendanceTables");

    let currentData = null;
    let allTeachers = [];


    // Универсальная функция для обновления выпадающих списков
    function updateSelectOptions(selectElement, options, defaultLabel) {
        const currentValue = selectElement.value;
        selectElement.innerHTML = `<option value="">${defaultLabel}</option>`;
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
            allTeachers = options;
        } else {
            options.forEach(option => {
                selectElement.innerHTML += `<option value="${option.id}">${option.name}</option>`;
            });
        }
        if (currentValue && options.some(opt => opt.id == currentValue)) {
            selectElement.value = currentValue;
        } else {
            selectElement.value = "";
        }
    }

    // Функции для загрузки данных с сервера
    function loadAllTeachers() {
        return fetchWithCookie('/auth/admin/api/get_all_teachers')
            .then(response => response.json())
            .then(teachers => {
                updateSelectOptions(teacherFilter, teachers, "Все преподаватели");
            })
            .catch(error => console.error('Ошибка загрузки преподавателей:', error));
    }

    function loadAllLessons() {
        return fetchWithCookie('/auth/admin/api/get_all_lessons')
            .then(response => response.json())
            .then(lessons => {
                updateSelectOptions(lessonFilter, lessons, "Все предметы");
            })
            .catch(error => console.error('Ошибка загрузки предметов:', error));
    }

    function loadAllGroups() {
        return fetchWithCookie('/auth/admin/api/get_all_groups')
            .then(response => response.json())
            .then(groups => {
                updateSelectOptions(groupFilter, groups, "Все группы");
            })
            .catch(error => console.error('Ошибка загрузки групп:', error));
    }

    function updateLessonsByTeacher() {
        const teacherId = teacherFilter.value;
        if (teacherId) {
            return fetchWithCookie(`/auth/admin/api/get_lessons_by_teacher?teacher_id=${teacherId}`)
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
            return fetchWithCookie(`/auth/admin/api/get_groups_by_teacher?teacher_id=${teacherId}`)
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
            return fetchWithCookie(`/auth/admin/api/get_groups_by_lesson?lesson_id=${lessonId}`)
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
            return fetchWithCookie(`/auth/admin/api/get_lessons_by_group?group_id=${groupId}`)
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
            return fetchWithCookie(`/auth/admin/api/get_teachers_by_group?group_id=${groupId}`)
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
            return fetchWithCookie(`/auth/admin/api/get_teachers_by_lesson?lesson_id=${lessonId}`)
                .then(response => response.json())
                .then(teachers => {
                    updateSelectOptions(teacherFilter, teachers, "Все преподаватели");
                })
                .catch(error => console.error('Ошибка в updateTeachersByLesson:', error));
        } else {
            return loadAllTeachers();
        }
    }

    function updateTeachers() {
        const groupId = groupFilter.value;
        const lessonId = lessonFilter.value;
        if (groupId && lessonId) {
            return fetchWithCookie(`/auth/admin/api/get_teachers_by_group_and_lesson?group_id=${groupId}&lesson_id=${lessonId}`)
                .then(response => response.json())
                .then(teachers => {
                    updateSelectOptions(teacherFilter, teachers, "Все преподаватели");
                })
                .catch(error => console.error('Ошибка в updateTeachersByGroupAndLesson:', error));
        } else if (groupId) {
            return updateTeachersByGroup();
        } else if (lessonId) {
            return updateTeachersByLesson();
        } else {
            return loadAllTeachers();
        }
    }

    // Функция для применения фильтров и загрузки данных
    function applyFilters() {
        const teacherId = teacherFilter.value || "";
        const lessonId = lessonFilter.value || "";
        const groupId = groupFilter.value || "";
        const dateFrom = dateFromFilter.value || "";
        const dateTo = dateToFilter.value || "";

        const params = new URLSearchParams({
            teacher_id: teacherId,
            lesson_id: lessonId,
            group_id: groupId,
            date_from: dateFrom,
            date_to: dateTo,
            format: "json"
        });

        fetchWithCookie(`/auth/admin/dashboard?${params.toString()}`)
            .then(response => response.json())
            .then(data => {
                attendanceTables.innerHTML = "";
                currentData = data;

                if (data.message) {
                    attendanceTables.innerHTML = `<p>${data.message}</p>`;
                    return;
                }

                data.attendance_by_group.sort((a, b) => {
                    if (a.teacher_fio < b.teacher_fio) return -1;
                    if (a.teacher_fio > b.teacher_fio) return 1;
                    if (a.lesson_name < b.lesson_name) return -1;
                    if (a.lesson_name > b.lesson_name) return 1;
                    if (a.groupname < b.groupname) return -1;
                    if (a.groupname > b.groupname) return 1;
                    return 0;
                });

                function compareFio(studentA, studentB) {
                    const [aSurname, aName, aPatronymic] = (studentA.fio || "").split(" ");
                    const [bSurname, bName, bPatronymic] = (studentB.fio || "").split(" ");
                    const surnameCompare = (aSurname || "").localeCompare(bSurname || "");
                    if (surnameCompare !== 0) return surnameCompare;
                    const nameCompare = (aName || "").localeCompare(bName || "");
                    if (nameCompare !== 0) return nameCompare;
                    return (aPatronymic || "").localeCompare(bPatronymic || "");
                }

                data.attendance_by_group.forEach(groupData => {
                    groupData.students.sort(compareFio);
                    let teacherDisplay = groupData.teacher_fio;
                    if (allTeachers.length > 0) {
                        const teacherObj = allTeachers.find(t => t.fio.trim() === groupData.teacher_fio.trim());
                        if (teacherObj) {
                            let duplicateCount = allTeachers.filter(t => t.fio.trim() === teacherObj.fio.trim()).length;
                            if (duplicateCount > 1) {
                                teacherDisplay += ` (${teacherObj.mail})`;
                            }
                        }
                    }

                    const groupBlock = document.createElement("div");
                    groupBlock.className = "group-block";
                    groupBlock.innerHTML = `
                        <h3>Преподаватель: ${teacherDisplay}</h3>
                        <h3>Предмет: ${groupData.lesson_name}</h3>
                        <h3>Группа: ${groupData.groupname}</h3>
                    `;

                    const table = document.createElement("table");
                    table.className = "attendance-table";
                    const thead = document.createElement("thead");
                    thead.innerHTML = `<tr><th>ФИО студента</th>` + groupData.dates.map(date => `<th>${date}</th>`).join("") + `</tr>`;
                    table.appendChild(thead);

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

    // Изначальная загрузка данных
    Promise.all([loadAllTeachers(), loadAllLessons(), loadAllGroups()]).then(() => {
        applyFilters();
    });

    // Обработчики событий для фильтров
    teacherFilter.addEventListener("change", () => {
        Promise.all([updateLessonsByTeacher(), updateGroupsByTeacher()]).then(() => applyFilters());
    });

    lessonFilter.addEventListener("change", () => {
        Promise.all([updateTeachers(), updateGroupsByLesson()]).then(() => applyFilters());
    });

    groupFilter.addEventListener("change", () => {
        Promise.all([updateTeachers(), updateLessonsByGroup()]).then(() => applyFilters());
    });

    dateFromFilter.addEventListener("change", applyFilters);
    dateToFilter.addEventListener("change", applyFilters);
    exportButton.addEventListener("click", exportToExcel);

    // Функция для экспорта данных в Excel
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

            let teacherDisplay = groupData.teacher_fio;
            if (allTeachers && allTeachers.length > 0) {
                const teacherObj = allTeachers.find(t => t.fio.trim() === groupData.teacher_fio.trim());
                if (teacherObj) {
                    let duplicateCount = allTeachers.filter(t => t.fio.trim() === teacherObj.fio.trim()).length;
                    if (duplicateCount > 1 && teacherObj.mail) {
                        teacherDisplay += ` (${teacherObj.mail})`;
                    }
                }
            }

            sheetData.push([`Преподаватель: ${teacherDisplay}`]);
            sheetData.push([`Предмет: ${lessonName}`]);
            sheetData.push([`Группа: ${groupData.groupname}`]);
            sheetData.push([]);
            const header = ["ФИО студента"].concat(groupData.dates);
            sheetData.push(header);

            groupData.students.forEach(student => {
                const row = [student.fio];
                groupData.dates.forEach(date => {
                    row.push(student.attendance[date] || "✖");
                });
                sheetData.push(row);
            });
            sheetData.push([]);
        });

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

        const now = new Date();
        const dateStr = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
        const fileName = `Посещаемость на ${dateStr}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }
});