document.addEventListener("DOMContentLoaded", function () {
    // Универсальная функция fetch с JWT и обработкой ошибок
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

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    // ============================================
    // Получение DOM-элементов
    // ============================================
    const lessonFilter = document.getElementById("lessonFilter");
    const groupFilter = document.getElementById("groupFilter");
    const dateFromFilter = document.getElementById("dateFrom");
    const dateToFilter = document.getElementById("dateTo");
    const exportButton = document.getElementById("exportButton");
    const attendanceTables = document.getElementById("attendanceTables");

    let currentData = null;

    // ============================================
    // Обновление опций выпадающего списка
    // ============================================
    function updateSelectOptions(selectElement, options, defaultLabel) {
        const currentValue = selectElement.value;
        selectElement.innerHTML = `<option value="">${defaultLabel}</option>`;
        options.forEach(option => {
            selectElement.innerHTML += `<option value="${option.id}">${option.name}</option>`;
        });
        if (currentValue && options.some(opt => opt.id == currentValue)) {
            selectElement.value = currentValue;
        } else {
            selectElement.value = "";
        }
    }

    // ============================================
    // Загрузка всех предметов
    // ============================================
    function loadAllLessons() {
        return fetchWithCookie('/auth/teacher/api/get_lessons_by_teacher')
            .then(response => response.json())
            .then(lessons => {
                updateSelectOptions(lessonFilter, lessons, "Все предметы");
            })
            .catch(error => console.error('Ошибка загрузки предметов:', error));
    }

    // ============================================
    // Загрузка всех групп
    // ============================================
    function loadAllGroups() {
        return fetchWithCookie('/auth/teacher/api/get_groups_by_teacher')
            .then(response => response.json())
            .then(groups => {
                updateSelectOptions(groupFilter, groups, "Все группы");
            })
            .catch(error => console.error('Ошибка загрузки групп:', error));
    }

    // ============================================
    // Обновление групп по предмету
    // ============================================
    function updateGroupsByLesson() {
        const lessonId = lessonFilter.value;
        if (lessonId) {
            return fetchWithCookie(`/auth/teacher/api/get_groups_by_lesson?lesson_id=${lessonId}`)
                .then(response => response.json())
                .then(groups => {
                    updateSelectOptions(groupFilter, groups, "Все группы");
                })
                .catch(error => console.error('Ошибка в updateGroupsByLesson:', error));
        } else {
            return loadAllGroups();
        }
    }

    // ============================================
    // Обновление предметов по группе
    // ============================================
    function updateLessonsByGroup() {
        const groupId = groupFilter.value;
        if (groupId) {
            return fetchWithCookie(`/auth/teacher/api/get_lessons_by_group?group_id=${groupId}`)
                .then(response => response.json())
                .then(lessons => {
                    updateSelectOptions(lessonFilter, lessons, "Все предметы");
                })
                .catch(error => console.error('Ошибка в updateLessonsByGroup:', error));
        } else {
            return loadAllLessons();
        }
    }

    // ============================================
    // Применение фильтров и загрузка данных
    // ============================================
    function applyFilters() {
        const lessonId = lessonFilter.value || "";
        const groupId = groupFilter.value || "";
        const dateFrom = dateFromFilter.value || "";
        const dateTo = dateToFilter.value || "";

        const params = new URLSearchParams({
            lesson_id: lessonId,
            group_id: groupId,
            date_from: dateFrom,
            date_to: dateTo,
            format: "json"
        });

        fetchWithCookie(`/auth/teacher/dashboard?${params.toString()}`)
            .then(response => response.json())
            .then(data => {
                attendanceTables.innerHTML = "";
                currentData = data;

                if (data.message) {
                    attendanceTables.innerHTML = `<p>${data.message}</p>`;
                    return;
                }

                data.attendance_by_group.sort((a, b) => {
                    if (a.lesson_name < b.lesson_name) return -1;
                    if (a.lesson_name > b.lesson_name) return 1;
                    if (a.groupname < b.groupname) return -1;
                    if (a.groupname > b.groupname) return 1;
                    return 0;
                });

                data.attendance_by_group.forEach(groupData => {
                    groupData.students.sort((a, b) => a.fio.localeCompare(b.fio));
                    const groupBlock = document.createElement("div");
                    groupBlock.className = "group-block";
                    groupBlock.innerHTML = `
                        <h3>Предмет: ${groupData.lesson_name}</h3>
                        <h3>Группа: ${groupData.groupname}</h3>
                    `;

                    const table = document.createElement("table");
                    table.className = "attendance-table";

                    const thead = document.createElement("thead");
                    thead.innerHTML = `<tr><th>ФИО студента</th>` +
                        groupData.dates.map(date => `<th>${date}</th>`).join("") + `</tr>`;
                    table.appendChild(thead);

                    const tbody = document.createElement("tbody");
                    groupData.students.forEach(student => {
                        const tr = document.createElement("tr");
                        tr.innerHTML = `<td>${student.fio}</td>` +
                            groupData.dates.map(date => {
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
    // Выгрузка данных в Excel
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

    // Изначальная загрузка данных
    Promise.all([loadAllLessons(), loadAllGroups()]).then(() => {
        applyFilters();
    });

    // Обработчики событий для обновления фильтров
    lessonFilter.addEventListener("change", () => {
        updateGroupsByLesson().then(() => applyFilters());
    });

    groupFilter.addEventListener("change", () => {
        updateLessonsByGroup().then(() => applyFilters());
    });

    dateFromFilter.addEventListener("change", applyFilters);
    dateToFilter.addEventListener("change", applyFilters);

    exportButton.addEventListener("click", exportToExcel);
});
