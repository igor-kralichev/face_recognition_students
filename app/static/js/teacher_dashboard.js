document.addEventListener("DOMContentLoaded", function () {
    // ============================================
    // Получение ссылок на DOM-элементы
    // ============================================
    const lessonFilter = document.getElementById("lessonFilter");
    const groupFilter = document.getElementById("groupFilter");
    const dateFromFilter = document.getElementById("dateFrom");
    const dateToFilter = document.getElementById("dateTo");
    const exportButton = document.getElementById("exportButton");
    const attendanceTables = document.getElementById("attendanceTables");

    let currentData = null; // Для хранения данных о посещаемости

    // ============================================
    // Универсальная функция для обновления выпадающих списков
    // ============================================
    function updateSelectOptions(selectElement, options, defaultLabel) {
        const currentValue = selectElement.value; // Запоминаем текущее значение
        selectElement.innerHTML = `<option value="">${defaultLabel}</option>`;
        options.forEach(option => {
            selectElement.innerHTML += `<option value="${option.id}">${option.name}</option>`;
        });
        // Сохраняем текущее значение, если оно есть в новом списке
        if (currentValue && options.some(opt => opt.id == currentValue)) {
            selectElement.value = currentValue;
        } else {
            selectElement.value = ""; // Сбрасываем, если значение не найдено
        }
    }

    // ============================================
    // Функция для загрузки всех предметов преподавателя
    // ============================================
    function loadAllLessons() {
        return fetch('/auth/teacher/api/get_lessons_by_teacher')
            .then(response => response.json())
            .then(lessons => {
                updateSelectOptions(lessonFilter, lessons, "Все предметы");
            })
            .catch(error => console.error('Ошибка загрузки предметов:', error));
    }

    // ============================================
    // Функция для загрузки всех групп преподавателя
    // ============================================
    function loadAllGroups() {
        return fetch('/auth/teacher/api/get_groups_by_teacher')
            .then(response => response.json())
            .then(groups => {
                updateSelectOptions(groupFilter, groups, "Все группы");
            })
            .catch(error => console.error('Ошибка загрузки групп:', error));
    }

    // ============================================
    // Обновление списка групп по предмету
    // ============================================
    function updateGroupsByLesson() {
        const lessonId = lessonFilter.value;
        if (lessonId) {
            return fetch(`/auth/teacher/api/get_groups_by_lesson?lesson_id=${lessonId}`)
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
    // Обновление списка предметов по группе
    // ============================================
    function updateLessonsByGroup() {
        const groupId = groupFilter.value;
        if (groupId) {
            return fetch(`/auth/teacher/api/get_lessons_by_group?group_id=${groupId}`)
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

        fetch(`/auth/teacher/dashboard?${params.toString()}`)
            .then(response => response.json())
            .then(data => {
                attendanceTables.innerHTML = ""; // Очищаем контейнер
                currentData = data; // Сохраняем данные для выгрузки

                if (data.message) {
                    attendanceTables.innerHTML = `<p>${data.message}</p>`;
                    return;
                }

                // Сортировка: сначала по предмету (lesson_name), затем по группе (groupname)
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
    // Функция для выгрузки данных в Excel
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

    // ============================================
    // Изначальная загрузка всех данных
    // ============================================
    Promise.all([loadAllLessons(), loadAllGroups()]).then(() => {
        applyFilters(); // Загружаем данные по умолчанию
    });

    // ============================================
    // Обработчики событий для динамического обновления фильтров
    // ============================================
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