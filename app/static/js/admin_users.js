document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // Получение ссылок на DOM-элементы
    // ============================================
    const elements = {
        showUsersButton: document.getElementById("showUsers"),
        showRegisterButton: document.getElementById("showRegister"),
        usersList: document.getElementById("usersList"),
        registerFormContainer: document.getElementById("registerFormContainer"),
        usersTableDisplay: document.querySelector("#usersTableDisplay"),
        displayTableBody: document.querySelector('#usersTableDisplay tbody'),
        registerTableBody: document.querySelector('#usersTableRegister tbody'),
        addRowsButton: document.getElementById('addRows'),
        rowCountInput: document.getElementById('rowCount'),
        form: document.getElementById('registerForm'),
        fillButton: document.getElementById('fillLoginsPasswords'),
        userData: document.getElementById('userData'),
        passwordModal: document.getElementById("passwordModal"),
        newPasswordInput: document.getElementById("newPassword"),
        confirmPasswordInput: document.getElementById("confirmPassword"),
        savePasswordButton: document.getElementById("savePasswordBtn"),
        searchFio: document.getElementById("searchFio")
    };

    // ============================================
    // Получение CSRF-токена и ID текущего пользователя
    // ============================================
    const csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content");
    const currentUserId = parseInt(elements.userData.getAttribute('data-current-user-id'), 10);

    // ============================================
    // Состояние сортировки таблицы
    // ============================================
    let sortState = { column: null, order: null };

    // ============================================
    // Функция обновления индикаторов сортировки
    // ============================================
    function updateSortIndicators() {
        document.querySelectorAll('#usersTableDisplay thead th[data-column]').forEach(th => {
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
    // Функция сортировки таблицы пользователей
    // ============================================
    function sortTable(column) {
        const rows = Array.from(elements.displayTableBody.querySelectorAll('tr'));
        if (rows.length === 0) return;
        let columnIndex;
        switch (column) {
            case 'fio': columnIndex = 0; break;
            case 'role': columnIndex = 4; break; // Обновлено из-за новых колонок
            default: return;
        }
        if (sortState.column === column) {
            sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.column = column;
            sortState.order = 'asc';
        }
        rows.sort((a, b) => {
            const aValue = a.querySelector(`td:nth-child(${columnIndex + 1})`).textContent.trim();
            const bValue = b.querySelector(`td:nth-child(${columnIndex + 1})`).textContent.trim();
            return sortState.order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        });
        elements.displayTableBody.innerHTML = '';
        rows.forEach(row => elements.displayTableBody.appendChild(row));
        updateSortIndicators();
    }

    // ============================================
    // Обработчики кликов на заголовки столбцов таблицы
    // ============================================
    document.querySelectorAll('#usersTableDisplay thead th[data-column]').forEach(th => {
        th.addEventListener('click', () => sortTable(th.getAttribute('data-column')));
    });

    // ============================================
    // Инициализация индикаторов сортировки
    // ============================================
    updateSortIndicators();

    // ============================================
    // Инициализация отображения: режим "Пользователи"
    // ============================================
    function initializeDisplay() {
        elements.registerFormContainer.style.display = "none";
        elements.usersList.style.display = "block";
        elements.searchFio.style.display = "block";
        loadUsers();
    }

    // ============================================
    // Установка обработчиков событий
    // ============================================
    function setupEventListeners() {
        elements.showUsersButton.addEventListener("click", showUsers);
        elements.showRegisterButton.addEventListener("click", showRegisterForm);
        elements.usersTableDisplay.addEventListener("click", handleUserActions);
        elements.addRowsButton.addEventListener("click", addMultipleRows);
        elements.registerTableBody.addEventListener("click", removeRow);
        elements.form.addEventListener("submit", handleFormSubmit);
        elements.fillButton.addEventListener("click", fillLoginsAndPasswords);

        document.querySelector('#passwordModal .close')?.addEventListener('click', closePasswordModal);
        document.querySelectorAll('.toggle-password').forEach(button => {
            button.addEventListener('click', () => {
                const input = button.previousElementSibling;
                if (input && input.tagName === 'INPUT') input.type = input.type === "password" ? "text" : "password";
            });
        });
        elements.savePasswordButton?.addEventListener('click', saveNewPassword);

        elements.searchFio.addEventListener('input', () => {
            const filter = elements.searchFio.value.toLowerCase();
            elements.displayTableBody.querySelectorAll('tr').forEach(row => {
                const fio = row.cells[0].textContent.toLowerCase();
                row.style.display = fio.includes(filter) ? '' : 'none';
            });
        });
    }

    // ============================================
    // Переключение режимов: "Пользователи" и "Регистрация"
    // ============================================
    function showUsers() {
        elements.usersList.style.display = "block";
        elements.registerFormContainer.style.display = "none";
        elements.searchFio.style.display = "block";
        loadUsers();
    }

    function showRegisterForm() {
        elements.usersList.style.display = "none";
        elements.registerFormContainer.style.display = "block";
        elements.searchFio.style.display = "none";
        addRow();
    }

    // ============================================
    // Загрузка списка пользователей
    // ============================================
    async function loadUsers() {
        try {
            const response = await fetch('/auth/admin/api/users', {
                method: 'GET',
                headers: {'Content-Type': 'application/json'}
            });
            if (!response.ok) throw new Error('Ошибка сети');
            const data = await response.json();
            renderUsers(data.users || []);
        } catch (error) {
            console.error('Ошибка при загрузке пользователей:', error);
        }
    }

    // ============================================
    // Отрисовка списка пользователей в таблице
    // ============================================
    function renderUsers(users) {
        elements.displayTableBody.innerHTML = '';
        if (users.length > 0) {
            users.forEach(user => {
                const isCurrentUser = parseInt(user.id) === currentUserId;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.fio || 'Не указано'}</td>
                    <td>${user.login || 'Не указано'}</td>
                    <td>${user.mail || 'Не указано'}</td>
                    <td>${user.birth_date || 'Не указано'}</td>
                    <td>${user.role || 'Не указано'}</td>
                    <td>
                        <button class="editUser" data-id="${user.id || 0}">Сменить пароль</button>
                        ${isCurrentUser ? '' : `<button class="deleteUser" data-id="${user.id || 0}">Удалить</button>`}
                    </td>
                `;
                elements.displayTableBody.appendChild(row);
            });
        } else {
            elements.displayTableBody.innerHTML = '<tr><td colspan="6">Нет пользователей</td></tr>';
        }
    }

    // ============================================
    // Функция проверки сложности пароля
    // ============================================
    function isPasswordStrong(password) {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasSpecialChar = /[\W_]/.test(password);
        return password.length >= minLength && hasUpperCase && hasLowerCase && hasSpecialChar;
    }

    // ============================================
    // Открытие и закрытие модального окна редактирования пароля
    // ============================================
    function openPasswordModal(userId) {
        elements.passwordModal.style.display = "block";
        elements.savePasswordButton.setAttribute("data-user-id", userId);
    }

    function closePasswordModal() {
        elements.passwordModal.style.display = "none";
    }

    // ============================================
    // Обработчик кнопки сохранения нового пароля
    // ============================================
    async function saveNewPassword() {
        const userId = elements.savePasswordButton.getAttribute("data-user-id");
        const newPassword = elements.newPasswordInput.value;
        const confirmPassword = elements.confirmPasswordInput.value;
        if (!isPasswordStrong(newPassword)) {
            alert("Пароль слишком слабый! Должен содержать минимум 8 символов, хотя бы одну заглавную, одну строчную букву и один спецсимвол.");
            return;
        }
        if (newPassword !== confirmPassword) {
            alert("Пароли не совпадают!");
            return;
        }
        try {
            const response = await fetch(`/auth/admin/api/update_password/${userId}`, {
                method: "POST",
                headers: {"Content-Type": "application/json", "X-CSRFToken": csrfToken},
                body: JSON.stringify({new_password: newPassword})
            });
            const data = await response.json();
            if (data.success) {
                alert("Пароль обновлён!");
                closePasswordModal();
            } else {
                alert("Ошибка при смене пароля.");
            }
        } catch (error) {
            console.error("Ошибка:", error);
        }
    }

    // ============================================
    // Обработчик действий с пользователями (удаление, редактирование)
    // ============================================
    async function handleUserActions(e) {
        if (e.target.classList.contains("deleteUser")) {
            const userId = e.target.getAttribute("data-id");
            if (confirm("Вы уверены, что хотите удалить этого пользователя?")) {
                try {
                    const response = await fetch(`/auth/admin/api/delete_user/${userId}`, {
                        method: "DELETE",
                        headers: {"Content-Type": "application/json", "X-CSRFToken": csrfToken}
                    });
                    const data = await response.json();
                    if (data.success) {
                        alert("Пользователь удалён");
                        loadUsers();
                    } else {
                        alert("Ошибка при удалении");
                    }
                } catch (error) {
                    console.error("Ошибка:", error);
                }
            }
        } else if (e.target.classList.contains("editUser")) {
            const userId = e.target.getAttribute("data-id");
            const currentPassword = prompt("Введите ваш текущий пароль для подтверждения:");
            if (!currentPassword) {
                alert("Редактирование отменено.");
                return;
            }
            try {
                const checkResponse = await fetch("/auth/admin/api/check_password", {
                    method: "POST",
                    headers: {"Content-Type": "application/json", "X-CSRFToken": csrfToken},
                    body: JSON.stringify({password: currentPassword})
                });
                const checkData = await checkResponse.json();
                if (!checkData.success) {
                    alert("Неверный пароль!");
                    return;
                }
                openPasswordModal(userId);
            } catch (error) {
                console.error("Ошибка при проверке пароля:", error);
            }
        }
    }

    // ============================================
    // Настройка выпадающего списка ролей
    // ============================================
    function setupRoleDropdown(row) {
        const roleDisplay = row.querySelector('.select-selected');
        const roleOptions = row.querySelector('.select-items');
        const roleInput = row.querySelector('.select-items');
        roleDisplay.addEventListener('click', () => {
            roleOptions.style.display = roleOptions.style.display === 'block' ? 'none' : 'block';
        });
        roleOptions.querySelectorAll('div').forEach(option => {
            option.addEventListener('click', () => {
                roleDisplay.textContent = option.textContent;
                roleInput.value = option.getAttribute('data-value');
                roleOptions.style.display = 'none';
            });
        });
        document.addEventListener('click', (e) => {
            if (!roleDisplay.contains(e.target) && !roleOptions.contains(e.target)) {
                roleOptions.style.display = 'none';
            }
        });
    }

    // ============================================
    // Транслитерация текста
    // ============================================
    function transliterate(text) {
        const translitMap = {
            'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'Zh', 'З': 'Z',
            'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R',
            'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
            'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z',
            'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
            'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
            'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
        };
        return text.split('').map(char => translitMap[char] || char).join('');
    }

    // ============================================
    // Генерация пароля
    // ============================================
    function generatePassword(length = 10) {
        const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let password = '';
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * charset.length);
            password += charset[randomIndex];
        }
        return password;
    }

    // ============================================
    // Генерация логина
    // ============================================
    async function generateLogin(fio, existingLogins) {
        let transliteratedFio = transliterate(fio).trim().replace(/[ьъЬЪ]/g, '');
        const parts = transliteratedFio.split(' ');
        if (parts.length < 2) return null;
        const lastName = parts[0].toLowerCase();
        const firstNameInitial = parts[1][0].toLowerCase();
        const middleNameInitial = parts.length > 2 ? parts[2][0].toLowerCase() + '_' : '';
        let login = `${firstNameInitial}_${middleNameInitial}${lastName}`;
        let uniqueLogin = login;
        let suffix = 1;
        while (existingLogins.has(uniqueLogin)) {
            uniqueLogin = `${login}${suffix}`;
            suffix++;
        }
        return uniqueLogin;
    }

    // ============================================
    // Получение существующих логинов
    // ============================================
    async function getExistingLogins() {
        try {
            const response = await fetch('/auth/admin/api/get_logins');
            if (!response.ok) throw new Error('Ошибка сети');
            const data = await response.json();
            return new Set(data.logins);
        } catch (error) {
            console.error('Ошибка при получении логинов:', error);
            return new Set();
        }
    }

    // ============================================
    // Автозаполнение логинов и паролей
    // ============================================
    async function fillLoginsAndPasswords() {
        const existingLogins = await getExistingLogins();
        const generatedLogins = new Set();
        const rows = elements.registerTableBody.querySelectorAll('tr');
        for (const row of rows) {
            const fioInput = row.querySelector('input[name="fio[]"]');
            const loginInput = row.querySelector('input[name="login[]"]');
            const passwordInput = row.querySelector('input[name="password[]"]');
            if (fioInput && loginInput && passwordInput && fioInput.value.trim()) {
                const login = await generateLogin(fioInput.value.trim(), new Set([...existingLogins, ...generatedLogins]));
                generatedLogins.add(login);
                existingLogins.add(login);
                loginInput.value = login;
                passwordInput.value = generatePassword();
            }
        }
    }

    // ============================================
    // Добавление строки в форму регистрации
    // ============================================
    function addRow() {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" name="fio[]" placeholder="Иванов Иван Иванович" pattern="[А-Яа-яЁё\\s-]{2,100}" title="ФИО: только буквы, пробелы, дефис (2-100 символов)" required></td>
            <td><input type="email" name="mail[]" placeholder="example@mail.ru" required></td>
            <td><input type="date" name="birth_date[]" required></td>
            <td><input disabled type="text" name="login[]" pattern="[a-zA-Z0-9_]{3,20}" title="Логин: 3-20 символов (буквы, цифры, подчёркивание)"></td>
            <td><input disabled type="text" name="password[]" pattern=".{8,}" title="Пароль: минимум 8 символов"></td>
            <td>
                <div class="custom-select">
                    <div class="select-selected">Выберите роль</div>
                    <div class="select-items">
                        <div data-value="admin">Администратор</div>
                        <div data-value="teacher">Преподаватель</div>
                    </div>
                </div>
            </td>
            <td><button type="button" class="removeRow">Удалить</button></td>
        `;
        elements.registerTableBody.appendChild(row);
        setupRoleDropdown(row.querySelector('.custom-select'));
    }

    // ============================================
    // Добавление нескольких строк в форму регистрации
    // ============================================
    function addMultipleRows() {
        const count = parseInt(elements.rowCountInput.value) || 1;
        for (let i = 0; i < count; i++) addRow();
    }

    // ============================================
    // Удаление строки из формы регистрации
    // ============================================
    function removeRow(e) {
        if (e.target.classList.contains('removeRow')) e.target.closest('tr').remove();
    }

    // ============================================
    // Обработка отправки формы регистрации
    // ============================================
    async function handleFormSubmit(e) {
        e.preventDefault();
        const rows = elements.registerTableBody.querySelectorAll('tr');
        const users = [];
        let isValid = true;
        rows.forEach(row => row.querySelectorAll('.error')?.forEach(error => error.remove()));
        for (const row of rows) {
            const fioInput = row.querySelector('input[name="fio[]"]');
            const mailInput = row.querySelector('input[name="mail[]"]');
            const birthDateInput = row.querySelector('input[name="birth_date[]"]');
            const loginInput = row.querySelector('input[name="login[]"]');
            const passwordInput = row.querySelector('input[name="password[]"]');
            const roleInput = row.querySelector('.select-items');
            const fio = fioInput.value.trim();
            const mail = mailInput.value.trim();
            const birth_date = birthDateInput.value;
            const login = loginInput.value.trim();
            const password = passwordInput.value;
            const role = roleInput.value;

            if (fio || mail || birth_date || login || password || role) {
                if (!fio || !/^[А-Яа-яЁё\s-]{2,150}$/.test(fio)) {
                    appendError(fioInput, 'ФИО должно содержать только кириллицу, пробелы и дефис (2-150 символов)');
                    isValid = false;
                }
                if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
                    appendError(mailInput, 'Некорректный e-mail');
                    isValid = false;
                }
                if (!birth_date || new Date(birth_date) > new Date()) {
                    appendError(birthDateInput, 'Дата рождения обязательна и не может быть в будущем');
                    isValid = false;
                }
                if (login && !/^[a-zA-Z0-9_]{3,50}$/.test(login)) {
                    appendError(loginInput, 'Логин должен содержать 3-50 символов (буквы, цифры, подчёркивание)');
                    isValid = false;
                }
                if (password && password.length < 8) {
                    appendError(passwordInput, 'Пароль должен содержать минимум 8 символов');
                    isValid = false;
                }
                if (role === '') {
                    appendError(roleInput, 'Выберите роль');
                    isValid = false;
                }
                users.push({ fio, mail, birth_date, login, password, role });
            }
        }
        if (!isValid) return;
        try {
            const response = await fetch('/auth/admin/api/register_users', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'X-CSRFToken': csrfToken},
                body: JSON.stringify({ users })
            });
            const data = await response.json();
            if (data.success) {
                alert('Пользователи успешно добавлены');
                generateExcelFile(users);
                elements.registerTableBody.innerHTML = '';
            } else {
                alert('Ошибка при добавлении пользователей: ' + (data.message || 'Неизвестная ошибка'));
            }
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Произошла ошибка при отправке данных');
        }
    }

    // ============================================
    // Вспомогательная функция для добавления сообщения об ошибке
    // ============================================
    function appendError(input, message) {
        const error = document.createElement('span');
        error.className = 'error';
        error.textContent = message;
        input.parentNode.appendChild(error);
    }

    // ============================================
    // Генерация Excel-файла с данными пользователей
    // ============================================
    function generateExcelFile(users) {
        const now = new Date();
        const dateTimeString = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const fileName = `Зарегистрированные пользователи ${dateTimeString}.xlsx`;

        const adminData = users.filter(user => user.role === 'admin').map(user => [user.fio, user.mail, user.birth_date, user.login, user.password]);
        const teacherData = users.filter(user => user.role === 'teacher').map(user => [user.fio, user.mail, user.birth_date, user.login, user.password]);

        const wb = XLSX.utils.book_new();

        function createSheet(data, sheetName) {
            const headers = ['ФИО', 'E-mail', 'День рождения', 'Логин', 'Пароль'];
            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
            ws['!cols'] = headers.map((header, colIndex) => {
                const maxLength = Math.max(...data.map(row => (row[colIndex] || '').toString().length), header.length);
                return { wch: maxLength + 2 };
            });
            return { ws, sheetName };
        }

        if (adminData.length > 0) {
            const { ws, sheetName } = createSheet(adminData, 'Администраторы');
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
        if (teacherData.length > 0) {
            const { ws, sheetName } = createSheet(teacherData, 'Преподаватели');
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
        XLSX.writeFile(wb, fileName);
    }

    // ============================================
    // Изначальная инициализация отображения
    // ============================================
    initializeDisplay();
    setupEventListeners();
});