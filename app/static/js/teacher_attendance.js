document.addEventListener('DOMContentLoaded', function () {
    // ============================================
    // Получение ссылок на DOM-элементы
    // ============================================
    let validGroups = Array.from(document.querySelectorAll('#groupOptions option')).map(opt => opt.value.toLowerCase());
    let groupInput = document.getElementById('groupInput');
    let video = document.getElementById('video');
    let canvas = document.getElementById('canvas'); // Для захвата кадров
    let screenshotCanvas = document.getElementById('screenshotCanvas'); // Для отображения скриншота
    let statusDiv = document.getElementById('status');
    let ctx = canvas.getContext('2d');
    let screenshotCtx = screenshotCanvas.getContext('2d');
    let capturing = false;
    let intervalId;
    let recognizedStudents = [];
    let selectedSubjectId = null;
    let faceLocations = []; // Для хранения координат лиц
    let faceNames = []; // Для хранения имен распознанных лиц

    // ============================================
    // Получение CSRF-токена
    // ============================================
    const csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content");

    // ============================================
    // Обработчик кнопки "Далее"
    // ============================================
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
        const response = await fetch(`/auth/teacher/api/load_faces?group=${encodeURIComponent(groupInputValue)}`);
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

    // ============================================
    // Обработчик кнопки "Старт"
    // ============================================
    document.getElementById('startBtn').addEventListener('click', function () {
        if (!capturing) {
            capturing = true;
            statusDiv.innerText = 'Захват лиц запущен.';
            intervalId = setInterval(captureAndUpload, 2500); // Каждые 2.5 секунды
        }
    });

    // ============================================
    // Обработчик кнопки "Пауза"
    // ============================================
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

    // ============================================
    // Обработчик кнопки "Стоп"
    // ============================================
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

    // ============================================
    // Функция захвата и отправки кадров
    // ============================================
    async function captureAndUpload() {
        // Захватываем кадр с видео
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let dataURL = canvas.toDataURL('image/jpeg');

        try {
            const response = await fetch('/auth/teacher/api/recognize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({image: dataURL})
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            if (data.error) {
                console.error('Ошибка распознавания: ', data.error);
            } else {
                // Очищаем предыдущие данные о лицах
                faceLocations = [];
                faceNames = [];

                // Получаем координаты лиц и имена
                if (data.face_locations && data.recognized) {
                    faceLocations = data.face_locations; // Ожидаем, что сервер вернет координаты лиц
                    faceNames = data.recognized.map(r => r.fio); // Имена распознанных лиц
                }

                // Обновляем список распознанных студентов
                data.recognized.forEach(recognizedStudent => {
                    if (!recognizedStudents.find(s => s.fio === recognizedStudent.fio)) {
                        recognizedStudents.push({fio: recognizedStudent.fio});
                    }
                });

                // Отображаем скриншот с рамками и подписями
                displayScreenshotWithFaces(dataURL);
            }
        } catch (error) {
            console.error('Ошибка:', error);
            statusDiv.innerText = 'Ошибка: ' + error.message;
        }
    }

    // ============================================
    // Функция для отображения скриншота с рамками и подписями
    // ============================================
    function displayScreenshotWithFaces(dataURL) {
        const img = new Image();
        img.onload = function () {
            // Очищаем canvas и рисуем скриншот
            screenshotCtx.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
            screenshotCtx.drawImage(img, 0, 0, screenshotCanvas.width, screenshotCanvas.height);

            // Рисуем рамки и подписи для каждого лица
            faceLocations.forEach((location, index) => {
                const [top, right, bottom, left] = location;
                const name = faceNames[index] || "Неизвестный";

                // Масштабируем координаты под размер canvas
                const scaleX = screenshotCanvas.width / video.videoWidth;
                const scaleY = screenshotCanvas.height / video.videoHeight;
                const scaledTop = top * scaleY;
                const scaledRight = right * scaleX;
                const scaledBottom = bottom * scaleY;
                const scaledLeft = left * scaleX;

                // Рисуем зеленую рамку
                screenshotCtx.strokeStyle = 'green';
                screenshotCtx.lineWidth = 2;
                screenshotCtx.strokeRect(scaledLeft, scaledTop, scaledRight - scaledLeft, scaledBottom - scaledTop);

                // Рисуем подпись
                screenshotCtx.fillStyle = 'green';
                screenshotCtx.font = '16px Arial';
                screenshotCtx.fillText(name, scaledLeft, scaledTop - 10);
            });
        };
        img.src = dataURL;
    }

    // ============================================
    // Функция для заполнения итоговой таблицы
    // ============================================
    function fillAttendanceTable(recognizedStudents) {
        const groupName = document.getElementById('selectedGroup').textContent.trim();
        fetch(`/auth/teacher/api/students?group=${encodeURIComponent(groupName)}`)
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

    // ============================================
    // Обработчик кнопки "Завершить"
    // ============================================
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

        fetch('/auth/teacher/api/submit_attendance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
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
