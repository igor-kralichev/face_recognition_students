document.addEventListener('DOMContentLoaded', function () {
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

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }


    // Получение DOM-элементов
    let validGroups = Array.from(document.querySelectorAll('#groupOptions option')).map(opt => opt.value.toLowerCase());
    let groupInput = document.getElementById('groupInput');
    let video = document.getElementById('video');
    let canvas = document.getElementById('canvas');
    let screenshotCanvas = document.getElementById('screenshotCanvas');
    let statusDiv = document.getElementById('status');
    let ctx = canvas.getContext('2d');
    let screenshotCtx = screenshotCanvas.getContext('2d');
    let capturing = false;
    let intervalId;
    let recognizedStudents = [];
    let selectedSubjectId = null;
    let faceLocations = [];
    let faceNames = [];
    let currentFacingMode = 'user';


    // Проверка на мобильное устройство
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // Обработчик кнопки "Далее"
    document.getElementById('nextBtn').addEventListener('click', async function () {
        let subjectSelect = document.getElementById('subjectSelect');
        let groupInputValue = groupInput.value.trim();
        let subject = subjectSelect.value;

        if (!subject || !groupInputValue) {
            alert('Пожалуйста, выберите предмет и группу.');
            return;
        }

        if (!validGroups.includes(groupInputValue.toLowerCase())) {
            alert('Такой группы нет в базе, выберите другую.');
            return;
        }

        selectedSubjectId = subject;
        try {
            const response = await fetchWithCookie(`/auth/teacher/api/load_faces?group=${encodeURIComponent(groupInputValue)}`);
            const data = await response.json();
            if (!data.success) {
                alert('Ошибка загрузки данных для группы.');
                return;
            }
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Ошибка связи с сервером.');
            return;
        }

        document.getElementById('selectedSubject').textContent = subjectSelect.options[subjectSelect.selectedIndex].text;
        document.getElementById('selectedGroup').textContent = groupInputValue;
        document.getElementById('attendanceSelection').style.display = 'none';
        document.getElementById('attendanceRecording').style.display = 'block';

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            statusDiv.innerText = 'Ваш браузер не поддерживает доступ к камере.';
            return;
        }

        navigator.mediaDevices.getUserMedia({video: true})
            .then(function (stream) {
                video.srcObject = stream;
                video.play();
                if (isMobileDevice()) {
                    document.getElementById('switchCameraBtn').style.display = 'inline-block';
                }
            })
            .catch(function (err) {
                console.log("Ошибка доступа к камере: " + err.name + " - " + err.message);
                statusDiv.innerText = 'Ошибка: ' + err.message;
                if (err.name === 'NotAllowedError') {
                    statusDiv.innerText += ' Разрешите доступ к камере в настройках.';
                } else if (err.name === 'NotFoundError') {
                    statusDiv.innerText += ' Камера не найдена.';
                }
            });
    });

    // Обработчик кнопки "Сменить камеру" (только для мобильных)
    if (isMobileDevice()) {
        const switchCameraBtn = document.getElementById('switchCameraBtn');
        if (switchCameraBtn) {
            switchCameraBtn.addEventListener('click', async function () {
                if (video.srcObject) {
                    video.srcObject.getTracks().forEach(track => track.stop());
                }

                currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

                try {
                    const constraints = {video: {facingMode: {ideal: currentFacingMode}}};
                    const stream = await navigator.mediaDevices.getUserMedia(constraints);
                    video.srcObject = stream;

                    video.addEventListener('loadedmetadata', function () {
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        screenshotCanvas.width = video.videoWidth;
                        screenshotCanvas.height = video.videoHeight;
                    });

                    video.play();
                } catch (error) {
                    console.error('Ошибка при смене камеры:', error);
                    statusDiv.innerText = 'Ошибка при смене камеры: ' + error.message;
                }
            });
        } else {
            console.warn('Элемент с id "switchCameraBtn" не найден.');
        }
    }

    // Обработчик кнопки "Старт"
    document.getElementById('startBtn').addEventListener('click', function () {
        if (!capturing) {
            capturing = true;
            statusDiv.innerText = 'Захват лиц запущен.';
            intervalId = setInterval(captureAndUpload, 2500);
        }
    });

    // Обработчик кнопки "Пауза"
    document.getElementById('pauseBtn').addEventListener('click', function () {
        if (capturing) {
            capturing = false;
            clearInterval(intervalId);
            if (recognizedStudents.length > 0) {
                let names = recognizedStudents.map(s => s.fio).join(', ');
                statusDiv.innerText = 'Распознанные студенты: ' + names;
            } else {
                statusDiv.innerText = 'Ни один студент не распознан.';
            }
        }
    });

    // Обработчик кнопки "Стоп"
    document.getElementById('stopBtn').addEventListener('click', function () {
        if (capturing) {
            capturing = false;
            clearInterval(intervalId);
        }
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        statusDiv.innerText = 'Процесс остановлен.';
        document.getElementById('attendanceRecording').style.display = 'none';
        document.getElementById('attendanceSummary').style.display = 'block';
        fillAttendanceTable(recognizedStudents);
    });

    // Захват и отправка кадра
    async function captureAndUpload() {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let dataURL = canvas.toDataURL('image/jpeg');

        try {
            const response = await fetchWithCookie('/auth/teacher/api/recognize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({image: dataURL}),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
            }

            const data = await response.json();
            if (data.error) {
                console.error('Ошибка распознавания: ', data.error);
            } else {
                faceLocations = [];
                faceNames = [];

                if (data.face_locations && data.recognized) {
                    faceLocations = data.face_locations;
                    faceNames = data.recognized.map(r => r.fio);
                }

                data.recognized.forEach(recognizedStudent => {
                    if (!recognizedStudents.find(s => s.fio === recognizedStudent.fio)) {
                        recognizedStudents.push({fio: recognizedStudent.fio});
                    }
                });

                displayScreenshotWithFaces(dataURL);
            }
        } catch (error) {
            console.error('Ошибка:', error);
            statusDiv.innerText = 'Ошибка: ' + error.message;
        }
    }

    // Отображение скриншота с рамками и подписями
    function displayScreenshotWithFaces(dataURL) {
        const img = new Image();
        img.onload = function () {
            screenshotCtx.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
            screenshotCtx.drawImage(img, 0, 0, screenshotCanvas.width, screenshotCanvas.height);

            faceLocations.forEach((location, index) => {
                const [top, right, bottom, left] = location;
                const name = faceNames[index] || "Неизвестный";

                const scaleX = screenshotCanvas.width / video.videoWidth;
                const scaleY = screenshotCanvas.height / video.videoHeight;
                const scaledTop = top * scaleY;
                const scaledRight = right * scaleX;
                const scaledBottom = bottom * scaleY;
                const scaledLeft = left * scaleX;

                screenshotCtx.strokeStyle = 'green';
                screenshotCtx.lineWidth = 2;
                screenshotCtx.strokeRect(scaledLeft, scaledTop, scaledRight - scaledLeft, scaledBottom - scaledTop);

                screenshotCtx.fillStyle = 'green';
                screenshotCtx.font = '16px Arial';
                screenshotCtx.fillText(name, scaledLeft, scaledTop - 10);
            });
        };
        img.src = dataURL;
    }

    // Заполнение итоговой таблицы посещаемости
    function fillAttendanceTable(recognizedStudents) {
        const groupName = document.getElementById('selectedGroup').textContent.trim();
        fetchWithCookie(`/auth/teacher/api/students?group=${encodeURIComponent(groupName)}`)
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    alert('Ошибка загрузки списка студентов для группы.');
                    return;
                }
                let students = data.students;
                students = students.map(student => {
                    let attended = recognizedStudents.some(rec => rec.fio === student.fio);
                    return {...student, attended};
                });
                students.sort((a, b) => a.fio.localeCompare(b.fio));

                const tableBody = document.querySelector('#attendanceTable tbody');
                tableBody.innerHTML = '';
                students.forEach(student => {
                    const row = document.createElement('tr');
                    row.dataset.studentId = student.id;
                    row.innerHTML = `
                        <td>${student.fio}</td>
                        <td><input type="checkbox" name="attendance" ${student.attended ? 'checked' : ''}></td>
                    `;
                    tableBody.appendChild(row);
                });
            })
            .catch(error => {
                console.error('Ошибка загрузки студентов:', error);
            });
    }

    // Обработчик кнопки "Завершить"
    document.getElementById('finishBtn').addEventListener('click', function () {
        let tableRows = document.querySelectorAll('#attendanceTable tbody tr');
        let attendanceData = [];
        tableRows.forEach(row => {
            let studentId = row.dataset.studentId;
            let checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.checked) {
                attendanceData.push({id: studentId, attended: true});
            }
        });

        const selectedGroup = document.getElementById('selectedGroup').textContent.trim();
        const groupId = document.querySelector(`#groupOptions option[value="${selectedGroup}"]`).dataset.id;

        fetchWithCookie('/auth/teacher/api/submit_attendance', {
            method: 'POST',
            headers: {},
            body: JSON.stringify({
                students: attendanceData,
                subject_id: selectedSubjectId,
                group_id: groupId
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Посещаемость успешно зафиксирована.');
                } else {
                    alert(data.message || 'Ошибка при фиксации посещаемости.');
                }
            })
            .catch(error => {
                console.error('Ошибка:', error);
                alert('Ошибка при отправке данных.');
            });
    });
});
