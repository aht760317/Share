  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

    const firebaseConfig = {
        apiKey: "AIzaSyD9RSb0rQzuo0nELR6CvLE06jyktS8YI2s",
        authDomain: "my-project-9999-479215.firebaseapp.com",
        projectId: "my-project-9999-479215",
        storageBucket: "my-project-9999-479215.firebasestorage.app",
        messagingSenderId: "1020162825898",
        appId: "1:1020162825898:web:681a7825a197f34e713ad3"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const SECURITY_CODE = "8888";
    const CONFIRM_ROLLCALL_CODE = "0000";
    const WEEK_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const WEEK_DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

    const DEFAULT_FILTER_ORDER = [
        { key: 'today', label: '📅 今日全部' },
        { key: 'junior', label: '📙 今日國中' },
        { key: 'elementary_care', label: '📘 今日國小/課輔' },
        { key: 'all_courses', label: '👁️ 全部課程' }
    ];

    const DEFAULT_CONFIG_FILTER_ORDER = [
        { key: 'all', label: '🏫 全部' },
        { key: 'care', label: '🏢 課輔班' },
        { key: 'elementary', label: '📘 國小部' },
        { key: 'junior', label: '📙 國中部' }
    ];

    let searchDebounceTimer = null;
    let cloudSyncTimer = null;

    window.state = {
        courses: { care: [], elementary: [], junior: [] },
        students: [],
        holidays: JSON.parse(localStorage.getItem('gude_holidays') || '[]'),
        currentCourse: null,
        attendanceData: {},
        courseFilterMode: 'today', 
        currentDeptView: 'care',
        currentFilterClass: null,
        manageCategory: 'all',
        configDeptFilter: 'all',
        selectedSheetCourse: null,
        filterOrder: JSON.parse(localStorage.getItem('gude_filter_order_v2')) || DEFAULT_FILTER_ORDER,
        configFilterOrder: JSON.parse(localStorage.getItem('gude_config_filter_order_v1')) || DEFAULT_CONFIG_FILTER_ORDER,
        quickRollContext: { courseName: '', dateStr: '' },
        currentFilteredStudents: []
    };

    // --- 🔔 Toast 通知系統 ---
    window.showToast = function(msg, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        const bg = type === 'success' ? '#2ecc71' : (type === 'error' ? '#e74c3c' : '#f39c12');
        toast.style.background = bg;
        toast.innerHTML = msg;
        
        container.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // --- 🛠️ 輔助工具 ---
    function disableButton(btnId, loadingText = '處理中...') {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.dataset.origText = btn.innerHTML;
            btn.innerHTML = `<span style="opacity:0.8">⏳ ${loadingText}</span>`;
            btn.disabled = true;
        }
    }
    
    function enableButton(btnId) {
        const btn = document.getElementById(btnId);
        if (btn && btn.dataset.origText) {
            btn.innerHTML = btn.dataset.origText;
            btn.disabled = false;
        }
    }

    function getTaiwanDateString(dateObj = new Date()) {
        const utc = dateObj.getTime() + (dateObj.getTimezoneOffset() * 60000);
        const taiwanTime = new Date(utc + (3600000 * 8));
        const y = taiwanTime.getFullYear();
        const m = String(taiwanTime.getMonth() + 1).padStart(2, '0');
        const d = String(taiwanTime.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function isStudentScheduledOnDate(student, courseName, dayName) {
        if (!student) return false;
        if (student.courseScheduleDays && student.courseScheduleDays[courseName]) {
            const customDays = student.courseScheduleDays[courseName];
            if (customDays && customDays.trim() !== '') {
                return customDays.includes(dayName) || customDays.includes(dayName.replace('星期', '週'));
            }
        }
        const allCourses = getAllCoursesList();
        const courseObj = allCourses.find(c => c.name === courseName);
        if (!courseObj) return true;
        if (courseObj.day === '') return false;
        if (courseObj.day === undefined || courseObj.day === null) return true;
        return courseObj.day.includes(dayName) || courseObj.day.includes(dayName.replace('星期', '週'));
    }

    window.onload = function() {
        const todayStr = getTaiwanDateString();
        document.getElementById('rollDateInput').value = todayStr;
        document.getElementById('alertDateInput').value = todayStr;
        document.getElementById('newHolidayDate').value = todayStr;
        initGradYearDropdowns();
        initDropdowns();
        renderCourseFilterButtons();
        renderConfigFilterButtons();
        initCloudData();
    };

    function initGradYearDropdowns() {
        const startSel = document.getElementById('gradStartYear');
        const endSel = document.getElementById('gradEndYear');
        if (!startSel || !endSel) return;

        const currentYear = new Date().getFullYear();
        let optionsHtml = '<option value="">不限年份</option>';
        for (let y = currentYear; y >= currentYear - 25; y--) {
            optionsHtml += `<option value="${y}">${y} 年</option>`;
        }

        startSel.innerHTML = optionsHtml;
        endSel.innerHTML = optionsHtml;
    }

    function checkPassword(promptText = "🔒 系統安全驗證，請輸入管理密碼：") {
        const input = prompt(promptText);
        if (input === SECURITY_CODE) return true;
        showToast("❌ 密碼不正確！操作已取消。", "error");
        return false;
    }

    function getStudentCoursesArray(stu) {
        if (!stu) return [];
        if (Array.isArray(stu.courses) && stu.courses.length > 0) return stu.courses;
        if (stu.course) return stu.course.split(/[,，、]/).map(c => c.trim()).filter(c => c);
        return [];
    }

    function renderDayCheckboxes(wrapperId, selectedDaysStr = "") {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;
        wrapper.innerHTML = '';
        const selectedArr = selectedDaysStr ? selectedDaysStr.split(/[,，、]/).map(d => d.trim()) : [];
        WEEK_DAYS.forEach(day => {
            const isChecked = selectedArr.includes(day);
            wrapper.innerHTML += `
                <label style="display:inline-flex; align-items:center; gap:4px; font-size:12.5px; cursor:pointer; user-select:none; font-weight:bold; color:#334155;">
                    <input type="checkbox" value="${day}" ${isChecked ? 'checked' : ''} style="width:auto; margin:0; cursor:pointer;"> ${day}
                </label>
            `;
        });
    }

    function getSelectedDaysFromWrapper(wrapperId) {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return '';
        const checkedBoxes = wrapper.querySelectorAll('input[type="checkbox"]:checked');
        const list = Array.from(checkedBoxes).map(cb => cb.value);
        return list.join('、');
    }

    // 🔄 優化：雙重保險載入雲端與本機備份，確保自動合併找回失蹤的點名紀錄
    async function initCloudData() {
        try {
            updateSyncIndicator('syncing', '🔄 正在載入雲端資料...');
            const coursesDoc = await getDoc(doc(db, "classLogSettings", "courses"));
            if (coursesDoc.exists()) {
                const data = coursesDoc.data().data || {};
                window.state.courses = {
                    care: data.care || [{ name: '小四課後安親輔導班', day: '星期一、星期二、星期三、星期四、星期五', time: '16:30 - 18:30', teacher: '陳老師' }],
                    elementary: data.elementary || [{ name: '小五數學培優班', day: '星期二、星期四', time: '18:30 - 20:30', teacher: '林老師' }],
                    junior: data.junior || [
                        { name: '國二數學進階A班', day: '星期一、星期四', time: '18:30 - 21:00', teacher: '吳老師' },
                        { name: '國三會考理化總複習', day: '星期三、星期五', time: '18:30 - 21:30', teacher: '張老師' }
                    ]
                };
            }

            const studentsSnapshot = await getDocs(collection(db, "classLogStudents"));
            window.state.students = [];
            studentsSnapshot.forEach(d => {
                const stuData = d.data();
                const coursesArr = getStudentCoursesArray(stuData);
                window.state.students.push({
                    firestoreId: d.id,
                    ...stuData,
                    courses: coursesArr,
                    courseScheduleDays: stuData.courseScheduleDays || {},
                    course: coursesArr.join('、'),
                    pickupNotes: stuData.pickupNotes || ''
                });
            });

            // 【自動救援合併機制】讀取雲端與本機，若本機有資料則安全合併至雲端資料內
            const attendanceDoc = await getDoc(doc(db, "classLogSettings", "attendance"));
            let cloudAttendance = attendanceDoc.exists() ? (attendanceDoc.data().data || {}) : {};
            let localAttendance = JSON.parse(localStorage.getItem('gude_attendance_records') || '{}');
            
            // 安全合併：以雲端為底，本機資料補上，確保昨日本機未上傳成功的資料會被保留
            window.state.attendanceData = { ...cloudAttendance, ...localAttendance };
            
            // 如果本機有紀錄，為了安全起見，立刻把合併好的結果再傳回雲端
            if (Object.keys(localAttendance).length > 0) {
                await setDoc(doc(db, "classLogSettings", "attendance"), { data: window.state.attendanceData });
            }
            
            // 更新本機最新備份
            localStorage.setItem('gude_attendance_records', JSON.stringify(window.state.attendanceData));

            const holidaysDoc = await getDoc(doc(db, "classLogSettings", "holidays"));
            if (holidaysDoc.exists()) {
                window.state.holidays = holidaysDoc.data().data || [];
                localStorage.setItem('gude_holidays', JSON.stringify(window.state.holidays));
            } else {
                window.state.holidays = JSON.parse(localStorage.getItem('gude_holidays') || '[]');
            }

            initDropdowns();
            renderCourseFilterButtons();
            renderConfigFilterButtons();
            renderMasterStudentsTable();
            renderCourseCards();
            renderSheetCourseDropdown();
            renderHolidayList();
            renderCourseConfigList();
            updateHomeAlertBanner();
            updateSyncIndicator('success', '☁️ 雲端同步完成');
            
            if (Object.keys(localAttendance).length > 0) {
                showToast("✅ 已成功合併本機暫存資料至雲端！", "success");
            }
            
        } catch (e) {
            console.error("載入資料失敗，啟動本機備份模式：", e);
            window.state.attendanceData = JSON.parse(localStorage.getItem('gude_attendance_records') || '{}');
            updateSyncIndicator('error', '⚠️ 離線備份模式');
        }
    }

    function updateSyncIndicator(status, text) {
        const indicator = document.getElementById('syncStatusIndicator');
        if (!indicator) return;
        indicator.innerText = text;
        if (status === 'success') {
            indicator.style.background = 'rgba(46,204,113,0.2)';
            indicator.style.color = '#2ecc71';
        } else if (status === 'syncing') {
            indicator.style.background = 'rgba(241,196,15,0.2)';
            indicator.style.color = '#f39c12';
        } else {
            indicator.style.background = 'rgba(231,76,60,0.2)';
            indicator.style.color = '#e74c3c';
        }
    }

    // 🚀 深度優化：加入防抖 (Debounce) 機制的雲端同步
    // 當連續點擊時，只寫入本機 localStorage，等停止操作 1 秒後才打上雲端，防卡頓防覆蓋。
    async function saveAttendanceToCloud() {
        updateSyncIndicator('syncing', '🔄 準備同步...');
        // 極速先存入本機，防止網頁突然關閉
        localStorage.setItem('gude_attendance_records', JSON.stringify(window.state.attendanceData));
        
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
        
        cloudSyncTimer = setTimeout(async () => {
            try {
                updateSyncIndicator('syncing', '🔄 正在寫入雲端...');
                await setDoc(doc(db, "classLogSettings", "attendance"), { data: window.state.attendanceData });
                updateSyncIndicator('success', '☁️ 雲端同步完成');
            } catch (e) {
                console.error("同步點名資料至雲端失敗：", e);
                updateSyncIndicator('error', '⚠️ 雲端同步失敗(已備份本機)');
                showToast("⚠️ 網路不穩，資料已備份於本機裝置", "warning");
            }
        }, 1000);
    }

    async function saveHolidaysToCloud() {
        try {
            localStorage.setItem('gude_holidays', JSON.stringify(window.state.holidays));
            await setDoc(doc(db, "classLogSettings", "holidays"), { data: window.state.holidays });
        } catch (e) {
            console.error("放假資料同步至雲端失敗：", e);
            showToast("放假資料同步失敗", "error");
        }
    }

    // 如果使用者在計時器還沒結束前就關閉視窗，這段可以盡量嘗試發送殘留請求
    window.addEventListener('beforeunload', () => {
        if (cloudSyncTimer) {
            localStorage.setItem('gude_attendance_records', JSON.stringify(window.state.attendanceData));
        }
    });

    window.switchTab = function(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('tab-rollcall').style.display = tab === 'rollcall' ? 'block' : 'none';
        document.getElementById('tab-absent-alert').style.display = tab === 'absent-alert' ? 'block' : 'none';
        document.getElementById('tab-sheet').style.display = tab === 'sheet' ? 'block' : 'none';
        document.getElementById('tab-course-config').style.display = tab === 'course-config' ? 'block' : 'none';
        document.getElementById('tab-students-master').style.display = tab === 'students-master' ? 'block' : 'none';

        if (tab === 'rollcall') {
            document.querySelectorAll('.tab-btn')[0].classList.add('active');
            renderCourseCards();
            updateHomeAlertBanner();
        } else if (tab === 'absent-alert') {
            document.querySelectorAll('.tab-btn')[1].classList.add('active');
            renderAbsentAlertTab();
        } else if (tab === 'sheet') {
            document.querySelectorAll('.tab-btn')[2].classList.add('active');
            renderSheetCourseDropdown();
            if (!window.state.selectedSheetCourse) {
                const all = getAllCoursesList();
                if (all.length > 0) selectSheetCourse(all[0].name);
            } else {
                generateCustomSheet();
            }
        } else if (tab === 'course-config') {
            document.querySelectorAll('.tab-btn')[3].classList.add('active');
            renderConfigFilterButtons();
            renderCourseConfigList();
            renderHolidayList();
        } else {
            document.querySelectorAll('.tab-btn')[4].classList.add('active');
            initDropdowns();
            renderMasterStudentsTable();
        }
    };

    function initDropdowns() {
        const deptSel = document.getElementById('deptSelectDropdown');
        if (deptSel) deptSel.value = window.state.currentDeptView;
        updateClassDropdownOptions();
    }

    window.onDeptDropdownChange = function(val) {
        window.state.currentDeptView = val;
        window.state.currentFilterClass = null;
        updateClassDropdownOptions();
        renderMasterStudentsTable();
    };

    window.onClassDropdownChange = function(val) {
        window.state.currentFilterClass = val === 'ALL' ? null : val;
        renderMasterStudentsTable();
    };

    function updateClassDropdownOptions() {
        const wrapper = document.getElementById('classDropdownWrapper');
        const classSel = document.getElementById('classSelectDropdown');
        const manageBox = document.getElementById('allClassesManageBox');
        const studentTableSection = document.getElementById('studentTableSection');
        const deptKey = window.state.currentDeptView;

        if (!wrapper || !classSel || !manageBox || !studentTableSection) return;

        if (deptKey === 'allclasses') {
            wrapper.style.display = 'none';
            studentTableSection.style.display = 'none';
            manageBox.style.display = 'block';
            renderAllClassesManagementCards();
            return;
        }

        manageBox.style.display = 'none';
        studentTableSection.style.display = 'block';

        if (deptKey === 'all' || deptKey === 'graduated') {
            wrapper.style.display = 'none';
            return;
        }

        wrapper.style.display = 'block';
        const list = window.state.courses[deptKey] || [];
        classSel.innerHTML = `<option value="ALL">-- 全部班級 --</option>`;
        list.forEach(c => {
            const cName = typeof c === 'object' ? c.name : c;
            const opt = document.createElement('option');
            opt.value = cName;
            opt.innerText = `🏫 ${cName}`;
            if (window.state.currentFilterClass === cName) opt.selected = true;
            classSel.appendChild(opt);
        });
    }

    window.setManageCategory = function(cat) {
        window.state.manageCategory = cat;
        document.querySelectorAll('#manageCatGroup .manage-cat-btn').forEach(btn => {
            if (btn.dataset.cat === cat) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        renderAllClassesManagementCards();
    };

    function renderAllClassesManagementCards() {
        const grid = document.getElementById('allClassesCardGrid');
        if (!grid) return;
        grid.innerHTML = '';

        const cat = window.state.manageCategory || 'all';
        let targetDepts = ['care', 'elementary', 'junior'];
        if (cat === 'care') targetDepts = ['care'];
        else if (cat === 'elementary') targetDepts = ['elementary'];
        else if (cat === 'junior') targetDepts = ['junior'];

        let totalCards = 0;

        targetDepts.forEach(deptKey => {
            const deptName = deptKey === 'care' ? '課輔部' : (deptKey === 'elementary' ? '國小部' : '國中部');
            const deptBadge = deptKey === 'care' ? '#0369a1' : (deptKey === 'elementary' ? '#15803d' : '#b45309');
            const list = window.state.courses[deptKey] || [];

            list.forEach((c) => {
                totalCards++;
                const cName = typeof c === 'object' ? c.name : c;
                const cDay = typeof c === 'object' ? (c.day || '未設時間') : '';
                const cTeacher = typeof c === 'object' ? (c.teacher || '任課老師') : '';
                const cTime = typeof c === 'object' ? (c.time || '未設定') : '';
                const stuCount = window.state.students.filter(s => {
                    const arr = getStudentCoursesArray(s);
                    return arr.includes(cName) && s.status !== 'graduated';
                }).length;

                const card = document.createElement('div');
                card.className = 'class-manage-card';

                card.innerHTML = `
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-size:11px; font-weight:bold; color:${deptBadge}; border:1px solid ${deptBadge}; padding:2px 6px; border-radius:4px;">${deptName}</span>
                        </div>
                        <div style="font-size:15px; font-weight:bold; color:var(--primary); margin:6px 0 3px;">🏫 ${cName}</div>
                        <div style="font-size:12px; color:#555;">授課：<b>${cTeacher}</b> | <b>${cDay || '無排課(保留)'}</b></div>
                        <div style="font-size:11.5px; color:#777; margin-top:2px;">時段：${cTime}</div>
                        <div style="font-size:12px; color:#666; margin-top:4px;">修課學生：<b>${stuCount}</b> 人</div>
                    </div>
                    <div style="margin-top:10px; border-top:1px dashed #e2e8f0; padding-top:8px; text-align:right;">
                        <button class="btn btn-warning" style="padding:4px 10px; font-size:12px; color:#000;" onclick="openEditClassModal('${deptKey}', decodeURIComponent('${encodeURIComponent(cName)}'), decodeURIComponent('${encodeURIComponent(cDay)}'), decodeURIComponent('${encodeURIComponent(cTime)}'), decodeURIComponent('${encodeURIComponent(cTeacher)}'))">⚙️ 管理班級</button>
                    </div>
                `;
                grid.appendChild(card);
            });
        });

        if (totalCards === 0) {
            grid.innerHTML = `<p style="color:#888; text-align:center; grid-column:1/-1; padding:15px;">目前該分類尚無建立任何班級課程。</p>`;
        }
    }

    function renderSheetCourseDropdown() {
        const select = document.getElementById('sheetCourseSelectDropdown');
        if (!select) return;
        select.innerHTML = '';

        const deptLabels = { care: '🏢 課輔部', elementary: '📘 國小部', junior: '📙 國中部' };
        let hasCourses = false;

        ['care', 'elementary', 'junior'].forEach(dept => {
            const list = window.state.courses[dept] || [];
            if (list.length > 0) {
                hasCourses = true;
                const optGroup = document.createElement('optgroup');
                optGroup.label = deptLabels[dept];

                list.forEach(c => {
                    const cName = typeof c === 'object' ? c.name : c;
                    const opt = document.createElement('option');
                    opt.value = cName;
                    opt.innerText = `🏫 ${cName}`;
                    if (window.state.selectedSheetCourse === cName) {
                        opt.selected = true;
                    }
                    optGroup.appendChild(opt);
                });
                select.appendChild(optGroup);
            }
        });

        if (!hasCourses) {
            select.innerHTML = `<option value="">目前尚無任何班級課程可供選取</option>`;
        } else if (!window.state.selectedSheetCourse) {
            const firstOpt = select.querySelector('option');
            if (firstOpt) {
                window.state.selectedSheetCourse = firstOpt.value;
                select.value = firstOpt.value;
            }
        }
    }

    window.onDropdownSelectCourse = function(courseName) {
        if (!courseName) return;
        selectSheetCourse(courseName);
    };

    window.selectSheetCourse = function(courseName) {
        window.state.selectedSheetCourse = courseName;
        const select = document.getElementById('sheetCourseSelectDropdown');
        if (select && select.value !== courseName) select.value = courseName;
        onSheetCourseChanged();
    };

    window.generateScheduleTimetable = function() {
        const cat = window.state.manageCategory || 'all';
        let targetDepts = ['care', 'elementary', 'junior'];
        let scopeTitle = "全校所有課程每週課表";
        if (cat === 'care') {
            targetDepts = ['care'];
            scopeTitle = "課輔部專屬每週課表";
        } else if (cat === 'elementary') {
            targetDepts = ['elementary'];
            scopeTitle = "國小部專屬每週課表";
        } else if (cat === 'junior') {
            targetDepts = ['junior'];
            scopeTitle = "國中部專屬每週課表";
        }

        document.getElementById('timetableModalTitle').innerText = `斗六顧德補習班 - ${scopeTitle}`;
        document.getElementById('timetableModalSub').innerText = `產表時間：${getTaiwanDateString()}`;

        const scheduleByDay = {
            '星期一': [], '星期二': [], '星期三': [], '星期四': [], '星期五': [], '星期六': [], '星期日': []
        };

        targetDepts.forEach(deptKey => {
            const list = window.state.courses[deptKey] || [];
            list.forEach(c => {
                const cName = typeof c === 'object' ? c.name : c;
                const cDay = typeof c === 'object' ? (c.day || '') : '';
                const cTime = typeof c === 'object' ? (c.time || '未設時段') : '未設時段';
                const cTeacher = typeof c === 'object' ? (c.teacher || '任課老師') : '任課老師';

                WEEK_DAYS.forEach(day => {
                    if (cDay.includes(day) || cDay.includes(day.replace('星期', '週'))) {
                        scheduleByDay[day].push({ dept: deptKey, name: cName, time: cTime, teacher: cTeacher });
                    }
                });
            });
        });

        WEEK_DAYS.forEach(day => {
            scheduleByDay[day].sort((a, b) => (a.time || '').localeCompare(b.time || '', 'zh-Hant'));
        });

        let gridHtml = `<div class="timetable-week-grid">`;
        WEEK_DAYS.forEach(day => {
            const courses = scheduleByDay[day] || [];
            gridHtml += `
                <div class="timetable-day-col">
                    <div class="timetable-day-header">${day}</div>
                    <div style="flex:1;">
            `;

            if (courses.length === 0) {
                gridHtml += `<div style="text-align:center; color:#94a3b8; font-size:12px; margin-top:20px;">-- 無排課 --</div>`;
            } else {
                courses.forEach(item => {
                    gridHtml += `
                        <div class="timetable-item">
                            <div><span class="c-time-badge">${item.time}</span></div>
                            <div class="c-title">${item.name}</div>
                            <div class="c-teacher">👨‍🏫 ${item.teacher}</div>
                        </div>
                    `;
                });
            }

            gridHtml += `</div></div>`;
        });
        gridHtml += `</div>`;

        document.getElementById('timetableContent').innerHTML = gridHtml;
        document.getElementById('timetableModal').style.display = 'flex';
    };

    window.printTimetable = function() {
        document.body.classList.add('print-timetable-only');
        window.print();
        setTimeout(() => { document.body.classList.remove('print-timetable-only'); }, 800);
    };

    window.openEditClassModal = function(dept, name, day, time, teacher) {
        document.getElementById('edit_original_dept').value = dept;
        document.getElementById('edit_original_name').value = name;
        document.getElementById('edit_class_dept').value = dept;
        document.getElementById('edit_class_name').value = name;
        renderDayCheckboxes('edit_class_days_wrapper', day);
        document.getElementById('edit_class_time').value = time;
        document.getElementById('edit_class_teacher').value = teacher;
        document.getElementById('editClassModal').style.display = 'flex';
    };

    window.saveEditedClass = async function() {
        const origDept = document.getElementById('edit_original_dept').value;
        const origName = document.getElementById('edit_original_name').value;
        const newDept = document.getElementById('edit_class_dept').value;
        const newName = document.getElementById('edit_class_name').value.trim();
        const newDay = getSelectedDaysFromWrapper('edit_class_days_wrapper');
        const newTime = document.getElementById('edit_class_time').value.trim() || '未設定';
        const newTeacher = document.getElementById('edit_class_teacher').value.trim() || '任課老師';

        if (!newName) return showToast('請輸入班級課程名稱！', 'error');

        disableButton('btnSaveEditClass');

        try {
            let origStartDate = getTaiwanDateString().slice(0, 8) + '01';
            let origEndDate = '';
            if (window.state.courses[origDept]) {
                const idx = window.state.courses[origDept].findIndex(c => (typeof c === 'object' ? c.name : c) === origName);
                if (idx !== -1) {
                    const oldObj = window.state.courses[origDept][idx];
                    if (typeof oldObj === 'object' && oldObj.startDate) origStartDate = oldObj.startDate;
                    if (typeof oldObj === 'object' && oldObj.endDate) origEndDate = oldObj.endDate;
                    window.state.courses[origDept].splice(idx, 1);
                }
            }

            if (!window.state.courses[newDept]) window.state.courses[newDept] = [];
            window.state.courses[newDept].push({ name: newName, day: newDay, time: newTime, teacher: newTeacher, startDate: origStartDate, endDate: origEndDate });

            await setDoc(doc(db, "classLogSettings", "courses"), { data: window.state.courses });

            if (origName !== newName) {
                const updatePromises = [];
                window.state.students.forEach(stu => {
                    const courses = getStudentCoursesArray(stu);
                    if (courses.includes(origName)) {
                        const updatedCourses = courses.map(c => c === origName ? newName : c);
                        stu.courses = updatedCourses;
                        stu.course = updatedCourses.join('、');
                        if (stu.courseScheduleDays && stu.courseScheduleDays[origName]) {
                            stu.courseScheduleDays[newName] = stu.courseScheduleDays[origName];
                            delete stu.courseScheduleDays[origName];
                        }
                        updatePromises.push(setDoc(doc(db, "classLogStudents", stu.firestoreId), { ...stu, courses: updatedCourses, course: stu.course, courseScheduleDays: stu.courseScheduleDays || {} }));
                    }
                });
                if (updatePromises.length > 0) await Promise.all(updatePromises);
            }

            document.getElementById('editClassModal').style.display = 'none';
            showToast(`✅ 班級【${newName}】已更新！`, 'success');
            initCloudData();
        } catch (e) { 
            console.error(e); 
            showToast('修改失敗！', 'error'); 
        } finally {
            enableButton('btnSaveEditClass');
        }
    };

    window.deleteClassCourseFromModal = async function() {
        const dept = document.getElementById('edit_original_dept').value;
        const className = document.getElementById('edit_original_name').value;
        if (!checkPassword(`🔒 刪除班級【${className}】請輸入管理密碼：`)) return;

        const countInClass = window.state.students.filter(s => {
            const arr = getStudentCoursesArray(s);
            return arr.includes(className) && s.status !== 'graduated';
        }).length;

        let warningText = `⚠️ 確定要刪除班級【${className}】嗎？`;
        if (countInClass > 0) warningText += `\n\n📌 提醒：目前有 ${countInClass} 位學生修習此課程。`;

        if (confirm(warningText)) {
            try {
                window.state.courses[dept] = window.state.courses[dept].filter(c => (typeof c === 'object' ? c.name : c) !== className);
                await setDoc(doc(db, "classLogSettings", "courses"), { data: window.state.courses });
                document.getElementById('editClassModal').style.display = 'none';
                showToast(`✅ 班級【${className}】已刪除！`, 'success');
                if (window.state.currentFilterClass === className) window.state.currentFilterClass = null;
                initCloudData();
            } catch (e) { console.error(e); showToast('刪除失敗！', 'error'); }
        }
    };

    window.openViewStudentModal = function(firestoreId) {
        const stu = window.state.students.find(s => s.firestoreId === firestoreId);
        if (!stu) return;

        document.getElementById('viewModalTitle').innerText = `👁️ 【${stu.name}】詳細學籍檔案`;
        const p1 = (stu.phones && stu.phones[0]) || { label: '媽媽', number: '-' };
        const p2 = (stu.phones && stu.phones[1]) || { label: '爸爸', number: '-' };
        const p3 = (stu.phones && stu.phones[2]) || { label: '學生本人', number: '-' };
        
        const stuCourses = getStudentCoursesArray(stu).map(c => {
            const customDays = (stu.courseScheduleDays && stu.courseScheduleDays[c]) ? `<span class="schedule-badge">(${stu.courseScheduleDays[c]})</span>` : '';
            return `<span class="course-tag">${c}${customDays}</span>`;
        }).join('') || '未選班級';

        let html = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #cbd5e1;">
                <div><b>姓名：</b>${stu.name} (${stu.gender || '男'})</div>
                <div><b>身分證字號：</b>${stu.idCard || '-'}</div>
                <div><b>就讀學校：</b>${stu.school || '-'}</div>
                <div><b>年級/座號：</b>${stu.studentClass || '-'}</div>
                <div><b>生日：</b>${stu.birthday || '-'}</div>
                <div><b>學籍狀態：</b>${stu.status === 'graduated' ? '<span style="color:#d946ef; font-weight:bold;">已畢業/離班</span>' : '<span style="color:#16a34a; font-weight:bold;">在籍就讀中</span>'}</div>
            </div>
            <div style="margin-top:10px; background:#fff; padding:12px; border-radius:8px; border:1px solid #cbd5e1;">
                <div style="font-weight:bold; color:var(--primary); margin-bottom:6px;">📞 聯絡電話：</div>
                <div>▪ ${p1.label}：<b>${p1.number || '-'}</b></div>
                <div>▪ ${p2.label}：<b>${p2.number || '-'}</b></div>
                <div>▪ ${p3.label}：<b>${p3.number || '-'}</b></div>
            </div>
            <div style="margin-top:10px; background:#fff; padding:12px; border-radius:8px; border:1px solid #cbd5e1;">
                <div><b>爸爸職業：</b>${stu.fatherJob || '-'} ｜ <b>媽媽職業：</b>${stu.motherJob || '-'}</div>
                <div style="margin-top:4px;"><b>健康狀況/過敏：</b>${stu.health || '-'}</div>
                <div style="margin-top:4px;"><b>通訊地址：</b>${stu.address || '-'}</div>
                
                <div style="margin-top:10px; background:#fdf2f8; border:1.5px solid #fbcfe8; padding:10px; border-radius:8px;">
                    <div style="color:#9d174d; font-weight:bold; font-size:13px;">🚗 學生接送備註(其他課程/學校社團)：</div>
                    <div style="color:#831843; font-size:13px; margin-top:3px; line-height:1.4;">${stu.pickupNotes ? stu.pickupNotes.replace(/\n/g, '<br>') : '無特殊接送備註'}</div>
                </div>

                <div style="margin-top:8px;"><b>修習課程：</b>${stuCourses}</div>
                <div style="margin-top:4px;"><b>學生詳細備註：</b>${stu.notes || '無'}</div>
            </div>
        `;
        document.getElementById('viewStudentContent').innerHTML = html;
        document.getElementById('viewStudentModal').style.display = 'flex';
    };

    window.clearGradFilter = function() {
        document.getElementById('gradStartYear').value = '';
        document.getElementById('gradEndYear').value = '';
        renderMasterStudentsTable();
    };

    window.handleStudentSearchDebounced = function() {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            renderMasterStudentsTable();
        }, 200);
    };

    window.renderMasterStudentsTable = function() {
        const tbody = document.getElementById('masterStudentTableBody');
        const cardContainer = document.getElementById('masterStudentCardContainer');
        const tableWrapper = document.getElementById('masterStudentTableWrapper');
        const gradFilterBar = document.getElementById('graduatedFilterBar');
        const gradCountBadge = document.getElementById('graduatedCountBadge');
        
        const deptKey = window.state.currentDeptView;
        const filterClass = window.state.currentFilterClass;
        const keyword = (document.getElementById('studentSearchInput').value || '').trim().toLowerCase();

        if (deptKey === 'allclasses') return;

        if (deptKey === 'graduated') {
            if (gradFilterBar) gradFilterBar.style.display = 'flex';
        } else {
            if (gradFilterBar) gradFilterBar.style.display = 'none';
        }

        const deptClasses = (window.state.courses[deptKey] || []).map(c => typeof c === 'object' ? c.name : c);

        let filtered = window.state.students.filter(s => {
            const isGraduated = s.status === 'graduated';
            const stuCourses = getStudentCoursesArray(s);
            if (deptKey === 'graduated') return isGraduated;
            else if (deptKey === 'all') return !isGraduated;
            else {
                if (isGraduated) return false;
                if (filterClass) return stuCourses.includes(filterClass);
                return stuCourses.some(c => deptClasses.includes(c));
            }
        });

        if (deptKey === 'graduated') {
            const startYearVal = parseInt(document.getElementById('gradStartYear').value);
            const endYearVal = parseInt(document.getElementById('gradEndYear').value);
            if (!isNaN(startYearVal) || !isNaN(endYearVal)) {
                filtered = filtered.filter(s => {
                    if (!s.birthday) return false;
                    const birthYear = parseInt(s.birthday.slice(0, 4));
                    if (isNaN(birthYear)) return false;
                    if (!isNaN(startYearVal) && birthYear < startYearVal) return false;
                    if (!isNaN(endYearVal) && birthYear > endYearVal) return false;
                    return true;
                });
            }
        }

        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-Hant'));

        if (keyword) {
            filtered = filtered.filter(s => {
                const name = (s.name || '').toLowerCase();
                const school = (s.school || '').toLowerCase();
                const stuClass = (s.studentClass || '').toLowerCase();
                const course = (s.course || '').toLowerCase();
                const bday = (s.birthday || '').toLowerCase();
                const pickup = (s.pickupNotes || '').toLowerCase();
                const notes = (s.notes || '').toLowerCase();
                const phones = (s.phones || []).map(p => p.number).join(' ');
                return name.includes(keyword) || school.includes(keyword) || stuClass.includes(keyword) || course.includes(keyword) || bday.includes(keyword) || phones.includes(keyword) || pickup.includes(keyword) || notes.includes(keyword);
            });
        }

        window.state.currentFilteredStudents = filtered;

        let titleDesc = '目前學生名冊';
        if (deptKey === 'graduated') titleDesc = '🎓 畢業/離班學員清單';
        else if (deptKey === 'all') titleDesc = '🌟 全校所有學生總覽';
        else titleDesc = `目前學生名冊 (${filterClass || (deptKey==='care'?'課輔部':(deptKey==='elementary'?'國小部':'國中部'))})`;

        document.getElementById('studentListTitle').innerText = `${titleDesc} - 共 ${filtered.length} 人`;
        if (gradCountBadge) gradCountBadge.innerText = `共 ${filtered.length} 人`;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" style="padding:20px; color:#888; text-align:center;">目前查無學生資料。</td></tr>`;
            if (cardContainer) cardContainer.innerHTML = `<div style="padding:20px; color:#888; text-align:center; background:#fff; border-radius:8px; border:1px solid #cbd5e1;">目前查無學生資料。</div>`;
            return;
        }

        const isMobile = window.innerWidth < 768;

        if (isMobile) {
            if (tableWrapper) tableWrapper.style.display = 'none';
            if (cardContainer) {
                cardContainer.style.display = 'block';
                let cardsHtml = '';
                filtered.forEach((stu, idx) => {
                    const stuCourses = getStudentCoursesArray(stu);
                    const coursesTags = stuCourses.map(c => {
                        const customDays = (stu.courseScheduleDays && stu.courseScheduleDays[c]) ? `<span class="schedule-badge">(${stu.courseScheduleDays[c]})</span>` : '';
                        return `<span class="course-tag">${c}${customDays}</span>`;
                    }).join('') || '<span style="color:#888;">未選班級</span>';
                    
                    const p1 = (stu.phones && stu.phones[0]) || { label: '媽媽', number: '' };
                    const p2 = (stu.phones && stu.phones[1]) || { label: '爸爸', number: '' };
                    const p3 = (stu.phones && stu.phones[2]) || { label: '學生本人', number: '' };
                    const genderClass = stu.gender === '女' ? 'gender-female' : 'gender-male';
                    
                    const formatPhoneText = (p) => (!p || !p.number || p.number.trim() === '') ? '' : `<div>📞 <b>${p.label}：</b><a href="tel:${p.number}" style="color:var(--accent); text-decoration:none;">${p.number}</a></div>`;

                    cardsHtml += `
                        <div class="student-master-card ${genderClass}">
                            <div class="student-master-card-header">
                                <div>
                                    <span style="font-size:12px; color:#888; font-weight:bold; margin-right:6px;">#${idx + 1}</span>
                                    <b style="font-size:16px; color:var(--primary);">${stu.name}</b>
                                    <span style="font-size:11px; background:${stu.gender==='女'?'#fce7f3':'#e0f2fe'}; color:${stu.gender==='女'?'#be185d':'#0369a1'}; padding:1px 5px; border-radius:3px; margin-left:4px;">${stu.gender || '男'}</span>
                                </div>
                                <div style="font-size:12.5px; color:#555;">🏫 ${stu.school || '-'} ${stu.studentClass || ''}</div>
                            </div>
                            <div class="student-master-card-body">
                                <div>🎂 <b>生日：</b>${stu.birthday || '-'}</div>
                                ${formatPhoneText(p1)}
                                ${formatPhoneText(p2)}
                                ${formatPhoneText(p3)}
                                <div style="margin-top:6px;"><b>📖 修習課程：</b><div>${coursesTags}</div></div>
                                ${stu.pickupNotes ? `<div style="margin-top:6px; background:#fdf2f8; border:1px solid #fbcfe8; padding:6px 8px; border-radius:6px; color:#9d174d; font-size:12.5px;">🚗 <b>接送/社團備註：</b>${stu.pickupNotes}</div>` : ''}
                            </div>
                            <div class="student-master-card-footer">
                                <button class="btn btn-warning action-btn" onclick="openQuickAssignModal('${stu.firestoreId}')">📋 加選</button>
                                <button class="btn btn-outline action-btn" onclick="openViewStudentModal('${stu.firestoreId}')">👁️ 瀏覽</button>
                                <button class="btn btn-primary action-btn" onclick="openEditStudentModal('${stu.firestoreId}')">✏️ 編輯</button>
                            </div>
                        </div>
                    `;
                });
                cardContainer.innerHTML = cardsHtml;
            }
        } else {
            if (cardContainer) cardContainer.style.display = 'none';
            if (tableWrapper) tableWrapper.style.display = 'block';

            let html = '';
            filtered.forEach((stu, idx) => {
                const stuCourses = getStudentCoursesArray(stu);
                const coursesTags = stuCourses.map(c => {
                    const customDays = (stu.courseScheduleDays && stu.courseScheduleDays[c]) ? `<span class="schedule-badge">(${stu.courseScheduleDays[c]})</span>` : '';
                    return `<span class="course-tag">${c}${customDays}</span>`;
                }).join('') || '<span style="color:#888;">未選班級</span>';

                const p1 = (stu.phones && stu.phones[0]) || { label: '媽媽', number: '' };
                const p2 = (stu.phones && stu.phones[1]) || { label: '爸爸', number: '' };
                const p3 = (stu.phones && stu.phones[2]) || { label: '學生本人', number: '' };
                const formatPlainPhone = (p) => (!p || !p.number || p.number.trim() === '') ? `<span style="color:#bbb;">-</span>` : `<div class="phone-plain-cell"><b>${p.label}:</b> ${p.number}</div>`;
                const genderRowClass = stu.gender === '女' ? 'gender-female' : 'gender-male';

                html += `
                    <tr class="${genderRowClass}">
                        <td style="font-weight:bold;">${idx + 1}</td>
                        <td><b style="color:var(--primary);">${stu.name}</b> <span style="font-size:11px; background:${stu.gender==='女'?'#fce7f3':'#e0f2fe'}; color:${stu.gender==='女'?'#be185d':'#0369a1'}; padding:1px 4px; border-radius:3px;">${stu.gender || '男'}</span></td>
                        <td style="font-size:12.5px;">${stu.birthday || '-'}</td>
                        <td style="font-weight:bold;">${stu.school || '-'}</td>
                        <td style="font-size:12.5px;">${stu.studentClass || '-'}</td>
                        <td>${formatPlainPhone(p1)}</td>
                        <td>${formatPlainPhone(p2)}</td>
                        <td>${formatPlainPhone(p3)}</td>
                        <td style="text-align:left;"><div>${coursesTags}</div></td>
                        <td style="text-align:left; font-size:12px; color:#9d174d; background:#fff7fa;">${stu.pickupNotes || '<span style="color:#ccc;">-</span>'}</td>
                        <td>
                            <div class="action-btn-group">
                                <button class="btn btn-warning action-btn" style="color:#000;" onclick="openQuickAssignModal('${stu.firestoreId}')">加選</button>
                                <button class="btn btn-outline action-btn" onclick="openViewStudentModal('${stu.firestoreId}')">瀏覽</button>
                                <button class="btn btn-primary action-btn" onclick="openEditStudentModal('${stu.firestoreId}')">編輯</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }
    };

    window.exportCurrentStudentsToCSV = function() {
        const list = window.state.currentFilteredStudents || [];
        if (list.length === 0) {
            return showToast('目前沒有可供下載的學生資料！', 'error');
        }

        const headers = [
            "編號", "學生姓名", "性別", "身分證字號", "就讀學校", "年級座號",
            "生日", "學籍狀態", "電話1稱謂", "電話1號碼", "電話2稱謂",
            "電話2號碼", "電話3稱謂", "電話3號碼", "修習課程與到班日", "接送備註",
            "父親職業", "母親職業", "健康狀況", "通訊地址", "詳細備註"
        ];

        const escapeCSV = (str) => {
            if (str === null || str === undefined) return '""';
            const s = String(str).replace(/"/g, '""');
            return `"${s}"`;
        };

        const rows = [headers.map(escapeCSV).join(",")];

        list.forEach((stu, index) => {
            const p1 = (stu.phones && stu.phones[0]) || { label: '', number: '' };
            const p2 = (stu.phones && stu.phones[1]) || { label: '', number: '' };
            const p3 = (stu.phones && stu.phones[2]) || { label: '', number: '' };
            
            const stuCourses = getStudentCoursesArray(stu).map(c => {
                const customDays = (stu.courseScheduleDays && stu.courseScheduleDays[c]) ? `[${stu.courseScheduleDays[c]}]` : '';
                return `${c}${customDays}`;
            }).join('、');

            const rowData = [
                index + 1,
                stu.name || '',
                stu.gender || '',
                stu.idCard || '',
                stu.school || '',
                stu.studentClass || '',
                stu.birthday || '',
                stu.status === 'graduated' ? '已畢業/離班' : '在籍就讀中',
                p1.label || '',
                p1.number || '',
                p2.label || '',
                p2.number || '',
                p3.label || '',
                p3.number || '',
                stuCourses,
                stu.pickupNotes || '',
                stu.fatherJob || '',
                stu.motherJob || '',
                stu.health || '',
                stu.address || '',
                stu.notes || ''
            ];
            rows.push(rowData.map(escapeCSV).join(","));
        });

        const csvContent = "\uFEFF" + rows.join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        const deptKey = window.state.currentDeptView;
        const filterClass = window.state.currentFilterClass;
        let fileTag = "顧德補習班_學生名冊";
        if (filterClass) fileTag += `_${filterClass}`;
        else if (deptKey === 'care') fileTag += "_課輔部";
        else if (deptKey === 'elementary') fileTag += "_國小部";
        else if (deptKey === 'junior') fileTag += "_國中部";
        else if (deptKey === 'graduated') fileTag += "_畢業班";
        else fileTag += "_全校學生";

        link.setAttribute("href", url);
        link.setAttribute("download", `${fileTag}_${getTaiwanDateString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    window.addEventListener('resize', () => {
        if (document.getElementById('tab-students-master').style.display !== 'none') {
            renderMasterStudentsTable();
        }
    });

    function getCourseOptionsHtml(selectedValue = "") {
        let html = `<option value="">-- 請選擇班級課程 --</option>`;
        const deptLabels = { care: '🏢 課輔部', elementary: '📘 國小部', junior: '📙 國中部' };
        ['care', 'elementary', 'junior'].forEach(dept => {
            const list = window.state.courses[dept] || [];
            if (list.length > 0) {
                html += `<optgroup label="${deptLabels[dept]}">`;
                list.forEach(c => {
                    const cName = typeof c === 'object' ? c.name : c;
                    html += `<option value="${cName}" ${cName === selectedValue ? 'selected' : ''}>${cName}</option>`;
                });
                html += `</optgroup>`;
            }
        });
        return html;
    }

    function getCourseDefaultDays(courseName) {
        if (!courseName) return [];
        const allCourses = getAllCoursesList();
        const course = allCourses.find(c => c.name === courseName);
        if (!course || !course.day) return [];
        return WEEK_DAYS.filter(d => course.day.includes(d) || course.day.includes(d.replace('星期', '週')));
    }

    window.addCourseSelectRow = function(wrapperId, selectedValue = "", customDaysStr = "") {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;
        
        const row = document.createElement('div');
        row.className = 'dynamic-course-row';

        const topRow = document.createElement('div');
        topRow.style.display = "flex";
        topRow.style.gap = "6px";
        topRow.style.alignItems = "center";
        topRow.style.flexWrap = "wrap";

        const select = document.createElement('select');
        select.className = "course-select-input select-styled";
        select.style.margin = "0";
        select.style.padding = "7px 10px";
        select.style.flex = "2";
        select.style.minWidth = "180px";
        select.innerHTML = getCourseOptionsHtml(selectedValue);

        const customBtn = document.createElement('button');
        customBtn.type = "button";
        customBtn.className = "btn";
        customBtn.style.padding = "6px 10px";
        customBtn.style.fontSize = "12px";
        customBtn.style.whiteSpace = "nowrap";

        const removeBtn = document.createElement('button');
        removeBtn.type = "button";
        removeBtn.className = "btn btn-danger";
        removeBtn.style.padding = "6px 10px";
        removeBtn.style.fontSize = "12px";
        removeBtn.innerText = "✖ 刪除此科";
        removeBtn.onclick = () => row.remove();

        const daysContainer = document.createElement('div');
        daysContainer.className = "course-days-container";
        daysContainer.style.marginTop = "8px";
        daysContainer.style.paddingTop = "8px";
        daysContainer.style.borderTop = "1px dashed #cbd5e1";
        daysContainer.style.fontSize = "12.5px";

        function updateDaysCheckboxesUI() {
            const curCourseName = select.value.trim();
            const courseDays = getCourseDefaultDays(curCourseName);
            const availableDays = courseDays.length > 0 ? courseDays : WEEK_DAYS;
            const selDaysArr = customDaysStr ? customDaysStr.split(/[,，、]/).map(d => d.trim()) : [];

            let html = `
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-weight:bold; color:#b45309;">📅 勾選此學生固定出席星期：</span>
            `;
            availableDays.forEach(day => {
                const isChecked = selDaysArr.length > 0 ? selDaysArr.includes(day) : true;
                html += `
                    <label style="display:inline-flex; align-items:center; gap:3px; cursor:pointer; color:#334155; font-weight:bold; margin-right:4px;">
                        <input type="checkbox" class="course-day-chk" value="${day}" ${isChecked ? 'checked' : ''} style="margin:0; width:auto; cursor:pointer;"> ${day.replace('星期', '週')}
                    </label>
                `;
            });
            html += `
                    <button type="button" class="btn btn-outline reset-default-btn" style="padding:2px 8px; font-size:11px; margin-left:auto;">恢復全勤(依課表)</button>
                </div>
                <div style="font-size:11px; color:#64748b; margin-top:4px;">💡 僅需勾選孩子固定會到班的星期（例如只勾選週三、週四），其餘未勾選的日子系統將自動視為免到校，不會發出未到警報。</div>
            `;
            daysContainer.innerHTML = html;

            const resetBtn = daysContainer.querySelector('.reset-default-btn');
            if (resetBtn) {
                resetBtn.onclick = () => {
                    customDaysStr = "";
                    daysContainer.style.display = "none";
                    customBtn.className = "btn btn-outline";
                    customBtn.innerText = "⚙️ 指定到班日";
                };
            }
        }

        if (customDaysStr && customDaysStr.trim() !== '') {
            daysContainer.style.display = "block";
            customBtn.className = "btn btn-warning";
            customBtn.innerText = "✏️ 修改到班日";
        } else {
            daysContainer.style.display = "none";
            customBtn.className = "btn btn-outline";
            customBtn.innerText = "⚙️ 指定到班日";
        }

        customBtn.onclick = () => {
            if (daysContainer.style.display === "none") {
                if (!select.value.trim()) return showToast('請先選擇班級課程！', 'error');
                daysContainer.style.display = "block";
                customBtn.className = "btn btn-warning";
                customBtn.innerText = "收合到班日設定";
                updateDaysCheckboxesUI();
            } else {
                daysContainer.style.display = "none";
                const checkedBoxes = daysContainer.querySelectorAll('.course-day-chk:checked');
                const checkedDays = Array.from(checkedBoxes).map(cb => cb.value);
                const curCourseDays = getCourseDefaultDays(select.value.trim());
                const allAvailable = curCourseDays.length > 0 ? curCourseDays : WEEK_DAYS;

                if (checkedDays.length > 0 && checkedDays.length < allAvailable.length) {
                    customBtn.className = "btn btn-warning";
                    customBtn.innerText = "✏️ 修改到班日";
                } else {
                    customDaysStr = "";
                    customBtn.className = "btn btn-outline";
                    customBtn.innerText = "⚙️ 指定到班日";
                }
            }
        };

        select.onchange = () => {
            if (daysContainer.style.display !== "none") {
                updateDaysCheckboxesUI();
            }
        };

        updateDaysCheckboxesUI();

        topRow.appendChild(select);
        topRow.appendChild(customBtn);
        topRow.appendChild(removeBtn);
        row.appendChild(topRow);
        row.appendChild(daysContainer);
        wrapper.appendChild(row);
    };

    function populateDynamicCourses(wrapperId, coursesArr = [], scheduleDaysObj = {}) {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;
        wrapper.innerHTML = '';
        if (!coursesArr || coursesArr.length === 0) {
            addCourseSelectRow(wrapperId, "", "");
        } else {
            coursesArr.forEach(cName => {
                const customDays = (scheduleDaysObj && scheduleDaysObj[cName]) || "";
                addCourseSelectRow(wrapperId, cName, customDays);
            });
        }
    }

    function getSelectedCoursesWithDays(wrapperId) {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return { courses: [], scheduleDays: {} };

        const rows = wrapper.querySelectorAll('.dynamic-course-row');
        const courses = [];
        const scheduleDays = {};

        rows.forEach(row => {
            const sel = row.querySelector('.course-select-input');
            if (!sel) return;
            const cName = sel.value.trim();
            if (!cName || courses.includes(cName)) return;

            courses.push(cName);

            const daysContainer = row.querySelector('.course-days-container');
            if (daysContainer && daysContainer.style.display !== 'none') {
                const checkedBoxes = daysContainer.querySelectorAll('.course-day-chk:checked');
                const checkedDays = Array.from(checkedBoxes).map(cb => cb.value);
                const curCourseDays = getCourseDefaultDays(cName);
                const allAvailable = curCourseDays.length > 0 ? curCourseDays : WEEK_DAYS;

                if (checkedDays.length > 0 && checkedDays.length < allAvailable.length) {
                    scheduleDays[cName] = checkedDays.join('、');
                }
            }
        });

        return { courses, scheduleDays };
    }

    window.onSchoolSelectChange = function(val) {
        const customInput = document.getElementById('m_stu_school_custom');
        if (val === '幼稚園' || val === '其他') {
            customInput.style.display = 'block';
            customInput.value = '';
            customInput.placeholder = val === '幼稚園' ? '請輸入幼稚園名稱...' : '請手動輸入學校名稱...';
        } else {
            customInput.style.display = 'none';
            customInput.value = '';
        }
    };

    window.openStudentModal = function() {
        document.getElementById('studentModalTitle').innerText = "➕ 新增學生學籍檔案";
        document.getElementById('editStudentFirestoreId').value = "";
        document.getElementById('btnDeleteStudent').style.display = "none";
        document.getElementById('m_stu_name').value = "";
        document.getElementById('m_stu_gender').value = "男";
        document.getElementById('m_stu_idcard').value = "";
        
        const schoolSel = document.getElementById('m_stu_school');
        const schoolCustom = document.getElementById('m_stu_school_custom');
        schoolSel.value = "";
        schoolCustom.style.display = "none";
        schoolCustom.value = "";

        document.getElementById('m_stu_class').value = "";
        document.getElementById('m_stu_birthday').value = "";
        document.getElementById('m_stu_status').value = "active";
        document.getElementById('m_stu_p1_label').value = "媽媽";
        document.getElementById('m_stu_p1_num').value = "";
        document.getElementById('m_stu_p2_label').value = "爸爸";
        document.getElementById('m_stu_p2_num').value = "";
        document.getElementById('m_stu_p3_label').value = "學生本人";
        document.getElementById('m_stu_p3_num').value = "";
        document.getElementById('m_stu_address').value = "";
        document.getElementById('m_stu_pickup_notes').value = "";
        document.getElementById('m_stu_father_job').value = "";
        document.getElementById('m_stu_mother_job').value = "";
        document.getElementById('m_stu_health').value = "";
        document.getElementById('m_stu_notes').value = "";
        populateDynamicCourses('studentCoursesWrapper', [], {});
        document.getElementById('studentModal').style.display = "flex";
    };

    window.openEditStudentModal = function(firestoreId) {
        const stu = window.state.students.find(s => s.firestoreId === firestoreId);
        if (!stu) return;
        document.getElementById('studentModalTitle').innerText = `✏️ 編輯【${stu.name}】學籍`;
        document.getElementById('editStudentFirestoreId').value = firestoreId;
        document.getElementById('btnDeleteStudent').style.display = "inline-block";
        document.getElementById('m_stu_name').value = stu.name || '';
        document.getElementById('m_stu_gender').value = stu.gender || '男';
        document.getElementById('m_stu_idcard').value = stu.idCard || '';

        const schoolSel = document.getElementById('m_stu_school');
        const schoolCustom = document.getElementById('m_stu_school_custom');
        const stuSchool = stu.school || '';

        let foundInSelect = false;
        for (let opt of schoolSel.options) {
            if (opt.value === stuSchool) {
                foundInSelect = true;
                break;
            }
        }

        if (foundInSelect) {
            schoolSel.value = stuSchool;
            schoolCustom.style.display = 'none';
            schoolCustom.value = '';
        } else if (stuSchool.includes('幼稚園')) {
            schoolSel.value = '幼稚園';
            schoolCustom.style.display = 'block';
            schoolCustom.value = stuSchool;
        } else if (stuSchool) {
            schoolSel.value = '其他';
            schoolCustom.style.display = 'block';
            schoolCustom.value = stuSchool;
        } else {
            schoolSel.value = '';
            schoolCustom.style.display = 'none';
            schoolCustom.value = '';
        }

        document.getElementById('m_stu_class').value = stu.studentClass || '';
        document.getElementById('m_stu_birthday').value = stu.birthday || '';
        document.getElementById('m_stu_status').value = stu.status || 'active';
        const p1 = (stu.phones && stu.phones[0]) || { label: '媽媽', number: '' };
        const p2 = (stu.phones && stu.phones[1]) || { label: '爸爸', number: '' };
        const p3 = (stu.phones && stu.phones[2]) || { label: '學生本人', number: '' };
        document.getElementById('m_stu_p1_label').value = p1.label || '媽媽';
        document.getElementById('m_stu_p1_num').value = p1.number || '';
        document.getElementById('m_stu_p2_label').value = p2.label || '爸爸';
        document.getElementById('m_stu_p2_num').value = p2.number || '';
        document.getElementById('m_stu_p3_label').value = p3.label || '學生本人';
        document.getElementById('m_stu_p3_num').value = p3.number || '';
        document.getElementById('m_stu_address').value = stu.address || '';
        document.getElementById('m_stu_pickup_notes').value = stu.pickupNotes || '';
        document.getElementById('m_stu_father_job').value = stu.fatherJob || '';
        document.getElementById('m_stu_mother_job').value = stu.motherJob || '';
        document.getElementById('m_stu_health').value = stu.health || '';
        document.getElementById('m_stu_notes').value = stu.notes || '';
        
        populateDynamicCourses('studentCoursesWrapper', getStudentCoursesArray(stu), stu.courseScheduleDays || {});
        document.getElementById('studentModal').style.display = "flex";
    };

    window.closeStudentModal = function() { document.getElementById('studentModal').style.display = "none"; };

    window.saveStudentMasterData = async function() {
        const firestoreId = document.getElementById('editStudentFirestoreId').value;
        const name = document.getElementById('m_stu_name').value.trim();
        const { courses: selectedCourses, scheduleDays: courseScheduleDays } = getSelectedCoursesWithDays('studentCoursesWrapper');

        if (!name) return showToast('⚠️ 學生姓名不能為空白！', 'error');
        if (selectedCourses.length === 0) return showToast('⚠️ 請至少為學生選擇一門修習的班級課程！', 'warning');

        disableButton('btnSaveStudentMaster');

        const schoolSelVal = document.getElementById('m_stu_school').value;
        const schoolCustomVal = document.getElementById('m_stu_school_custom').value.trim();
        let finalSchool = schoolSelVal;
        if ((schoolSelVal === '幼稚園' || schoolSelVal === '其他') && schoolCustomVal) {
            finalSchool = schoolCustomVal;
        }

        const studentData = {
            name: name,
            gender: document.getElementById('m_stu_gender').value,
            idCard: document.getElementById('m_stu_idcard').value.trim(),
            school: finalSchool,
            studentClass: document.getElementById('m_stu_class').value.trim(),
            birthday: document.getElementById('m_stu_birthday').value,
            courses: selectedCourses,
            courseScheduleDays: courseScheduleDays,
            course: selectedCourses.join('、'),
            status: document.getElementById('m_stu_status').value,
            phones: [
                { label: document.getElementById('m_stu_p1_label').value.trim(), number: document.getElementById('m_stu_p1_num').value.trim() },
                { label: document.getElementById('m_stu_p2_label').value.trim(), number: document.getElementById('m_stu_p2_num').value.trim() },
                { label: document.getElementById('m_stu_p3_label').value.trim(), number: document.getElementById('m_stu_p3_num').value.trim() }
            ],
            address: document.getElementById('m_stu_address').value.trim(),
            pickupNotes: document.getElementById('m_stu_pickup_notes').value.trim(),
            fatherJob: document.getElementById('m_stu_father_job').value.trim(),
            motherJob: document.getElementById('m_stu_mother_job').value.trim(),
            health: document.getElementById('m_stu_health').value.trim(),
            notes: document.getElementById('m_stu_notes').value.trim()
        };

        try {
            if (firestoreId) {
                const target = window.state.students.find(s => s.firestoreId === firestoreId);
                await setDoc(doc(db, "classLogStudents", firestoreId), { ...studentData, attendanceLogs: (target && target.attendanceLogs) || [] });
            } else {
                const docRef = doc(collection(db, "classLogStudents"));
                await setDoc(docRef, { ...studentData, attendanceLogs: [] });
            }
            closeStudentModal();
            showToast(`✅ 學生【${name}】資料已成功儲存！`, 'success');
            initCloudData();
        } catch (e) { 
            console.error(e); 
            showToast('儲存失敗！請檢查網路。', 'error'); 
        } finally {
            enableButton('btnSaveStudentMaster');
        }
    };

    window.openQuickAssignModal = function(firestoreId) {
        const stu = window.state.students.find(s => s.firestoreId === firestoreId);
        if (!stu) return;
        document.getElementById('quickAssignTitle').innerText = `📋 為【${stu.name}】加選班級課程`;
        document.getElementById('quickAssignFirestoreId').value = firestoreId;
        populateDynamicCourses('quickAssignWrapper', getStudentCoursesArray(stu), stu.courseScheduleDays || {});
        document.getElementById('quickAssignModal').style.display = 'flex';
    };

    window.saveQuickAssign = async function() {
        const firestoreId = document.getElementById('quickAssignFirestoreId').value;
        const stu = window.state.students.find(s => s.firestoreId === firestoreId);
        if (!stu) return;
        const { courses: selectedCourses, scheduleDays: courseScheduleDays } = getSelectedCoursesWithDays('quickAssignWrapper');
        if (selectedCourses.length === 0) return showToast('⚠️ 請至少選擇一個修習班級！', 'warning');

        disableButton('btnSaveQuickAssign');

        try {
            stu.courses = selectedCourses;
            stu.courseScheduleDays = courseScheduleDays;
            stu.course = selectedCourses.join('、');
            await setDoc(doc(db, "classLogStudents", firestoreId), { ...stu, courses: selectedCourses, courseScheduleDays: courseScheduleDays, course: stu.course });
            document.getElementById('quickAssignModal').style.display = 'none';
            showToast(`✅ 已成功更新【${stu.name}】修課名冊！`, 'success');
            initCloudData();
        } catch (e) { 
            console.error(e); 
            showToast('加選失敗！', 'error'); 
        } finally {
            enableButton('btnSaveQuickAssign');
        }
    };

    window.deleteMasterStudent = async function() {
        const firestoreId = document.getElementById('editStudentFirestoreId').value;
        const name = document.getElementById('m_stu_name').value;
        if (!firestoreId) return;
        if (!checkPassword(`🔒 刪除【${name}】學籍資料，請輸入管理密碼：`)) return;

        if (confirm(`⚠️ 確定要永久刪除【${name}】的學生檔案嗎？`)) {
            try {
                await deleteDoc(doc(db, "classLogStudents", firestoreId));
                closeStudentModal();
                showToast(`✅ 學生【${name}】資料已刪除！`, 'success');
                initCloudData();
            } catch (e) { console.error(e); showToast('刪除失敗！', 'error'); }
        }
    };

    window.openAddClassModal = function() {
        document.getElementById('m_new_class_name').value = '';
        renderDayCheckboxes('m_new_class_days_wrapper', '');
        document.getElementById('m_new_class_time').value = '';
        document.getElementById('m_new_class_teacher').value = '';
        document.getElementById('addClassModal').style.display = 'flex';
    };

    window.saveNewClass = async function() {
        const dept = document.getElementById('m_new_class_dept').value;
        const name = document.getElementById('m_new_class_name').value.trim();
        const day = getSelectedDaysFromWrapper('m_new_class_days_wrapper');
        const time = document.getElementById('m_new_class_time').value.trim() || '未設定';
        const teacher = document.getElementById('m_new_class_teacher').value.trim() || '任課老師';
        if (!name) return showToast('請輸入班級課程名稱！', 'error');

        disableButton('btnSaveNewClass');

        if (!window.state.courses[dept]) window.state.courses[dept] = [];
        window.state.courses[dept].push({ name, day, time, teacher, startDate: getTaiwanDateString().slice(0, 8) + '01', endDate: '' });

        try {
            await setDoc(doc(db, "classLogSettings", "courses"), { data: window.state.courses });
            document.getElementById('addClassModal').style.display = 'none';
            showToast(`✅ 已成功新增【${name}】班級！`, 'success');
            initCloudData();
        } catch (e) { 
            showToast('新增失敗！', 'error'); 
        } finally {
            enableButton('btnSaveNewClass');
        }
    };

    function getParentPhone(stu) {
        if (!stu) return '-';
        if (stu.phones && Array.isArray(stu.phones) && stu.phones.length > 0) {
            const first = stu.phones.find(p => p.number && p.number.trim() !== '');
            if (first) return `${first.label}: ${first.number}`;
        }
        return stu.parentPhone || stu.phone || '-';
    }

    function getAllCoursesList() {
        let list = [];
        const defaultStart = getTaiwanDateString().slice(0, 8) + '01';
        ['care', 'elementary', 'junior'].forEach(dept => {
            (window.state.courses[dept] || []).forEach((c) => {
                const name = typeof c === 'object' ? c.name : c;
                list.push({
                    dept: dept,
                    name: name,
                    day: typeof c === 'object' ? (c.day !== undefined ? c.day : '') : '',
                    time: typeof c === 'object' ? (c.time || '') : '',
                    teacher: typeof c === 'object' ? (c.teacher || '') : '',
                    startDate: (typeof c === 'object' && c.startDate) ? c.startDate : defaultStart,
                    endDate: (typeof c === 'object' && c.endDate) ? c.endDate : ''
                });
            });
        });
        return list;
    }

    window.onDateChange = function() {
        renderCourseCards();
        updateHomeAlertBanner();
        if (window.state.currentCourse) selectCourse(window.state.currentCourse.name);
    };

    function renderCourseFilterButtons() {
        const container = document.getElementById('courseFilterGroup');
        if (!container) return;
        container.innerHTML = '';

        window.state.filterOrder.forEach((item) => {
            const btn = document.createElement('div');
            btn.className = `filter-pill ${window.state.courseFilterMode === item.key ? 'active' : ''}`;
            btn.innerText = item.label;
            btn.onclick = () => setCourseFilter(item.key);
            container.appendChild(btn);
        });
    }

    window.setCourseFilter = function(mode) {
        window.state.courseFilterMode = mode;
        renderCourseFilterButtons();
        renderCourseCards();
    };

    function renderCourseCards() {
        const curDate = new Date(document.getElementById('rollDateInput').value);
        const dayIdx = curDate.getDay();
        const curDayName = WEEK_NAMES[dayIdx];

        document.getElementById('currentDayText').innerText = 
            `📅 點名日期：${curDate.toISOString().slice(0,10)} (${curDayName})`;

        const grid = document.getElementById('courseGrid');
        grid.innerHTML = '';

        const allCourses = getAllCoursesList();
        const mode = window.state.courseFilterMode || 'today';
        const todayCourses = allCourses.filter(c => c.day && (c.day.includes(curDayName) || c.day.includes(curDayName.replace('星期', '週'))));

        let filteredCourses = [];
        if (mode === 'today') filteredCourses = todayCourses;
        else if (mode === 'junior') filteredCourses = todayCourses.filter(c => c.dept === 'junior');
        else if (mode === 'elementary_care') filteredCourses = todayCourses.filter(c => c.dept === 'elementary' || c.dept === 'care');
        else if (mode === 'all_courses') filteredCourses = allCourses;

        if (filteredCourses.length === 0) {
            let msg = `本日 (${curDayName}) 此分類無排課班級。`;
            if (mode === 'all_courses') msg = `目前全校尚無任何排課班級。`;
            grid.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: #888; background: #fff; border-radius: 8px; border: 1px dashed #ccc; font-size:13.5px;">${msg}</div>`;
            return;
        }

        filteredCourses.forEach(c => {
            const isToday = c.day && (c.day.includes(curDayName) || c.day.includes(curDayName.replace('星期', '週')));
            const deptLabel = c.dept === 'care' ? '課輔部' : (c.dept === 'elementary' ? '國小部' : '國中部');
            const deptColor = c.dept === 'care' ? '#e0f2fe' : (c.dept === 'elementary' ? '#dcfce7' : '#fef3c7');
            const deptTxt = c.dept === 'care' ? '#0369a1' : (c.dept === 'elementary' ? '#15803d' : '#b45309');

            const card = document.createElement('div');
            card.className = `course-card ${window.state.currentCourse && window.state.currentCourse.name === c.name ? 'active' : ''}`;
            card.onclick = () => selectCourse(c.name);

            card.innerHTML = `
                <span style="font-size:11.5px; font-weight:bold; background:${deptColor}; color:${deptTxt}; padding:2px 6px; border-radius:4px;">
                    ${deptLabel}
                </span>
                ${isToday ? '<span style="float:right; background:#fee2e2; color:#b91c1c; font-size:11.5px; font-weight:bold; padding:2px 6px; border-radius:4px;">今日排課</span>' : ''}
                <div style="font-size:15px; font-weight:bold; margin:6px 0 2px; color:var(--primary);">${c.name}</div>
                <div style="font-size:12px; color:#64748b;">開課：${c.startDate} | 授課：${c.teacher || '老師'}</div>
            `;
            grid.appendChild(card);
        });
    }

    function selectCourse(courseName) {
        const allCourses = getAllCoursesList();
        window.state.currentCourse = allCourses.find(c => c.name === courseName) || allCourses[0];
        if (!window.state.currentCourse) return;

        const c = window.state.currentCourse;
        const deptLabel = c.dept === 'care' ? '課輔部' : (c.dept === 'elementary' ? '國小部' : '國中部');

        document.getElementById('rollDetailCard').style.display = 'block';
        document.getElementById('rollCourseTitle').innerText = `📖 ${c.name}`;
        document.getElementById('rollCourseMeta').innerText = `學制：${deptLabel} | 開課：${c.startDate} | 授課：${c.teacher || '老師'}`;

        const curDateStr = document.getElementById('rollDateInput').value;
        const holiday = window.state.holidays.find(h => h.date === curDateStr);
        const notice = document.getElementById('holidayNotice');
        if (holiday) {
            notice.innerText = `⚠️ 今日為放假日：【${holiday.name}】`;
            notice.style.display = 'inline';
        } else {
            notice.style.display = 'none';
        }

        renderStudentList();
        renderCourseCards();
    }

    function renderStudentList() {
        if (!window.state.currentCourse) return;
        const grid = document.getElementById('studentRollGrid');
        grid.innerHTML = '';

        const dateStr = document.getElementById('rollDateInput').value;
        const curDate = new Date(dateStr);
        const curDayName = WEEK_NAMES[curDate.getDay()];
        const c = window.state.currentCourse;
        
        const courseStudents = window.state.students.filter(s => {
            const arr = getStudentCoursesArray(s);
            const isEnrolled = arr.includes(c.name) && s.status !== 'graduated';
            return isEnrolled && isStudentScheduledOnDate(s, c.name, curDayName);
        });

        let presentCount = 0;
        let leaveCount = 0;
        let paperRowsHtml = '';

        courseStudents.forEach((stu, idx) => {
            const key = `${dateStr}_${c.name}_${stu.name}`;
            const record = window.state.attendanceData[key] || { status: '未到', time: '', reason: '' };
            if (record.status === '出席') presentCount++;
            if (record.status === '請假') leaveCount++;

            const phone = getParentPhone(stu);
            const isPresent = record.status === '出席';
            const isLeave = record.status === '請假';

            const customDays = (stu.courseScheduleDays && stu.courseScheduleDays[c.name]) || '';
            const customDayBadge = customDays ? `<span style="background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold;">固定到班：${customDays}</span>` : '';

            const card = document.createElement('div');
            card.className = `student-card ${isPresent ? 'present' : (isLeave ? 'leave' : '')}`;

            card.innerHTML = `
                <div>
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
                        <span style="font-size:16px; font-weight:bold; color:var(--primary);">${stu.name}</span>
                        ${customDayBadge}
                        ${stu.pickupNotes ? `<span style="background:#fdf2f8; border:1.5px solid #fbcfe8; color:#9d174d; padding:2px 8px; border-radius:6px; font-size:12.5px; font-weight:bold; display:inline-flex; align-items:center; gap:4px;">🚗 接送/社團備註：${stu.pickupNotes}</span>` : ''}
                    </div>
                    <div style="font-size:12px; color:#555; margin-top:3px;">
                        ${stu.school || '-'} | 電話：${phone}
                    </div>
                </div>
                <div style="display:flex; gap:6px; align-items:center; margin-top:10px; flex-wrap:wrap;">
                    <button class="btn ${isPresent ? 'btn-success' : 'btn-primary'}" style="flex:1; min-width:110px; padding:7px; font-size:13px;" onclick="setAttendance('${key}', '出席')">
                        ${isPresent ? '✔ 今日已到班' : '點名 (✔)'}
                    </button>
                    <button class="btn btn-warning" style="flex:1; min-width:90px; padding:7px; font-size:13px;" onclick="setAttendance('${key}', '請假')">
                        ${isLeave ? '▲ 已請假' : '請假 (▲)'}
                    </button>
                    <input type="text" placeholder="請輸入請假原因..." value="${record.reason || ''}" style="flex:2; min-width:180px; padding:6px 10px; border:1px solid #ccc; border-radius:6px; margin:0; font-size:13px;" onchange="saveReason('${key}', this.value)">
                </div>
            `;
            grid.appendChild(card);

            let statusText = `<span style="color:#999;">-</span>`;
            if (isPresent) statusText = `<span style="color:green; font-weight:bold; font-size:15px;">✔</span>`;
            if (isLeave) statusText = `<span style="color:red; font-weight:bold; font-size:14px;">▲</span>`;

            paperRowsHtml += `
                <tr>
                    <td>${idx + 1}</td>
                    <td><b>${stu.name}</b></td>
                    <td>${stu.school || '-'} ${stu.studentClass || ''}</td>
                    <td style="font-size:8.5pt;">${phone}</td>
                    <td>${statusText}</td>
                    <td style="text-align:left; font-size:12.5px; color:#b91c1c;">${record.reason || ''}</td>
                </tr>
            `;
        });

        document.getElementById('rollStatsText').innerText = 
            `應到：${courseStudents.length} 人 / 出席(✔)：${presentCount} 人 / 請假(▲)：${leaveCount} 人`;

        document.getElementById('paperCourseTitle').innerText = `斗六顧德補習班 - 【${c.name}】課堂點名總表`;
        document.getElementById('paperMetaInfo').innerText = `日期：${dateStr} | 教師：${c.teacher || '老師'} | 應到：${courseStudents.length} 人 | 實到：${presentCount} 人`;
        document.getElementById('paperTableBody').innerHTML = paperRowsHtml || `<tr><td colspan="6" style="padding:12px; color:#888;">此班級本日無排課學生</td></tr>`;
        
        updateHomeAlertBanner();
    }

    // 🚀 觸發防抖機制儲存
    window.setAttendance = async function(key, status) {
        if (!window.state.attendanceData[key]) window.state.attendanceData[key] = {};
        window.state.attendanceData[key].status = (window.state.attendanceData[key].status === status) ? '未到' : status;
        
        const utc = new Date().getTime() + (new Date().getTimezoneOffset() * 60000);
        const taiwanTime = new Date(utc + (3600000 * 8));
        window.state.attendanceData[key].time = taiwanTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        
        saveAttendanceToCloud(); // 觸發防抖
        renderStudentList();
        updateHomeAlertBanner();
        if (document.getElementById('quickRollModal').style.display === 'flex') {
            renderQuickRollModal(window.state.quickRollContext.courseName, window.state.quickRollContext.dateStr);
        }
    };

    window.saveReason = async function(key, val) {
        if (!window.state.attendanceData[key]) window.state.attendanceData[key] = { status: '請假' };
        window.state.attendanceData[key].reason = val.trim();
        saveAttendanceToCloud(); // 觸發防抖
        renderStudentList();
        if (document.getElementById('quickRollModal').style.display === 'flex') {
            renderQuickRollModal(window.state.quickRollContext.courseName, window.state.quickRollContext.dateStr);
        }
    };

    window.quickMarkAll = async function() {
        const dateStr = document.getElementById('rollDateInput').value;
        const curDate = new Date(dateStr);
        const curDayName = WEEK_NAMES[curDate.getDay()];
        const c = window.state.currentCourse;

        disableButton('btnQuickMarkAll');

        const courseStudents = window.state.students.filter(s => {
            const arr = getStudentCoursesArray(s);
            const isEnrolled = arr.includes(c.name) && s.status !== 'graduated';
            return isEnrolled && isStudentScheduledOnDate(s, c.name, curDayName);
        });

        courseStudents.forEach(stu => {
            const key = `${dateStr}_${c.name}_${stu.name}`;
            window.state.attendanceData[key] = { status: '出席', time: '全員到齊', reason: (window.state.attendanceData[key] ? window.state.attendanceData[key].reason : '') };
        });
        
        await saveAttendanceToCloud();
        renderStudentList();
        updateHomeAlertBanner();
        enableButton('btnQuickMarkAll');
        showToast('✅ 全員到齊已記錄！', 'success');
    };

    window.confirmRollCallAndSync = async function() {
        if (!window.state.currentCourse) return showToast("請先選擇要確認點名的課程！", "warning");
        const input = prompt("🔒 請輸入確認點名密碼：");
        if (input !== CONFIRM_ROLLCALL_CODE) return showToast("❌ 密碼錯誤！", "error");

        const courseName = window.state.currentCourse.name;
        
        // 強制立即同步
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
        try {
            updateSyncIndicator('syncing', '🔄 正在寫入雲端...');
            await setDoc(doc(db, "classLogSettings", "attendance"), { data: window.state.attendanceData });
            updateSyncIndicator('success', '☁️ 雲端同步完成');
            showToast(`✅ 點名確認成功！即將跳轉至點名總表。`, 'success');
            switchTab('sheet');
            selectSheetCourse(courseName);
            updateHomeAlertBanner();
        } catch(e) {
            showToast('同步失敗，請檢查網路。', 'error');
        }
    };

    window.resetRollCall = async function() {
        if (!window.state.currentCourse) return showToast("請先選擇要重新點名的課程！", "warning");
        const input = prompt("🔒 重新點名需要輸入管理密碼：");
        if (input !== CONFIRM_ROLLCALL_CODE) return showToast("❌ 密碼不正確！操作已取消。", "error");

        const dateStr = document.getElementById('rollDateInput').value;
        const curDate = new Date(dateStr);
        const curDayName = WEEK_NAMES[curDate.getDay()];
        const c = window.state.currentCourse;

        const courseStudents = window.state.students.filter(s => {
            const arr = getStudentCoursesArray(s);
            const isEnrolled = arr.includes(c.name) && s.status !== 'graduated';
            return isEnrolled && isStudentScheduledOnDate(s, c.name, curDayName);
        });

        courseStudents.forEach(stu => {
            const key = `${dateStr}_${c.name}_${stu.name}`;
            delete window.state.attendanceData[key];
        });

        // 強制立即同步
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
        await setDoc(doc(db, "classLogSettings", "attendance"), { data: window.state.attendanceData });
        
        renderStudentList();
        updateHomeAlertBanner();
        showToast(`✅ 已成功重置【${c.name}】於 ${dateStr} 的點名紀錄！`, "success");
    };

    window.quickMarkAllModal = async function() {
        const dateStr = window.state.quickRollContext.dateStr;
        const curDate = new Date(dateStr);
        const curDayName = WEEK_NAMES[curDate.getDay()];
        const courseName = window.state.quickRollContext.courseName;

        disableButton('btnQuickMarkModal');

        const courseStudents = window.state.students.filter(s => {
            const arr = getStudentCoursesArray(s);
            const isEnrolled = arr.includes(courseName) && s.status !== 'graduated';
            return isEnrolled && isStudentScheduledOnDate(s, courseName, curDayName);
        });

        courseStudents.forEach(stu => {
            const key = `${dateStr}_${courseName}_${stu.name}`;
            window.state.attendanceData[key] = { status: '出席', time: '全員到齊', reason: (window.state.attendanceData[key] ? window.state.attendanceData[key].reason : '') };
        });
        
        saveAttendanceToCloud();
        renderQuickRollModal(courseName, dateStr);
        renderAbsentAlertTab();
        updateHomeAlertBanner();
        enableButton('btnQuickMarkModal');
        showToast('✅ 全班出席已記錄！', 'success');
    };

    function getAbsentAndUncheckedSummary(dateStr) {
        const curDate = new Date(dateStr);
        const dayIdx = curDate.getDay();
        const curDayName = WEEK_NAMES[dayIdx];
        const allCourses = getAllCoursesList();
        const todayCourses = allCourses.filter(c => c.day && (c.day.includes(curDayName) || c.day.includes(curDayName.replace('星期', '週'))));

        let unassignedClasses = [];
        let absentStudentsList = [];

        todayCourses.forEach(c => {
            const courseStudents = window.state.students.filter(s => {
                const arr = getStudentCoursesArray(s);
                const isEnrolled = arr.includes(c.name) && s.status !== 'graduated';
                return isEnrolled && isStudentScheduledOnDate(s, c.name, curDayName);
            });

            let hasAnyCheck = false;
            courseStudents.forEach(stu => {
                const key = `${dateStr}_${c.name}_${stu.name}`;
                const rec = window.state.attendanceData[key];
                if (rec && (rec.status === '出席' || rec.status === '請假')) {
                    hasAnyCheck = true;
                    if (rec.status === '請假' || rec.status === '未到') {
                        absentStudentsList.push({ student: stu, courseName: c.name, status: rec.status, reason: rec.reason || '' });
                    }
                } else {
                    absentStudentsList.push({ student: stu, courseName: c.name, status: '尚未點名', reason: (rec ? rec.reason : '') || '' });
                }
            });

            if (!hasAnyCheck && courseStudents.length > 0) {
                unassignedClasses.push(c.name);
            }
        });

        return { todayCourses, unassignedClasses, absentStudentsList };
    }

    function updateHomeAlertBanner() {
        const dateStr = document.getElementById('rollDateInput').value;
        const summary = getAbsentAndUncheckedSummary(dateStr);
        const banner = document.getElementById('homeAlertBanner');
        const content = document.getElementById('homeAlertContent');
        if (!banner || !content) return;

        const unCheckedCount = summary.unassignedClasses.length;
        const unPresentStudents = summary.absentStudentsList.filter(item => item.status === '尚未點名' || item.status === '請假' || item.status === '未到').length;

        if (unCheckedCount === 0 && unPresentStudents === 0) {
            banner.style.background = 'linear-gradient(135deg, #f0fdf4, #dcfce7)';
            banner.style.border = '2px solid #22c55e';
            content.innerHTML = `<span style="color: #166534; font-weight: bold;">🌟 太棒了！今日所有排課班級皆已完成點名，且無學員缺席或未到！</span>`;
        } else {
            banner.style.background = 'linear-gradient(135deg, #fffbeb, #fef3c7)';
            banner.style.border = '2px solid #f59e0b';
            content.innerHTML = `
                <div>📌 <b>尚有未點名班級：</b> <span style="color:#b45309; font-weight:bold;">${unCheckedCount > 0 ? summary.unassignedClasses.join('、') : '無'}</span></div>
                <div style="margin-top:3px;">📌 <b>尚有尚未到班 / 請假學員：</b> <span style="color:#b91c1c; font-weight:bold;">共 ${unPresentStudents} 人次 (請至「還沒點名/未到」專區確認與填寫原因)</span></div>
            `;
        }
    }

    window.openQuickRollModal = function(courseName, dateStr) {
        window.state.quickRollContext = { courseName, dateStr };
        document.getElementById('quickRollModalTitle').innerText = `🏫 班級快速點名：【${courseName}】(${dateStr})`;
        renderQuickRollModal(courseName, dateStr);
        document.getElementById('quickRollModal').style.display = 'flex';
    };

    function renderQuickRollModal(courseName, dateStr) {
        const container = document.getElementById('quickRollStudentList');
        const statsEl = document.getElementById('quickRollStats');
        if (!container || !statsEl) return;

        const curDate = new Date(dateStr);
        const curDayName = WEEK_NAMES[curDate.getDay()];

        const courseStudents = window.state.students.filter(s => {
            const arr = getStudentCoursesArray(s);
            const isEnrolled = arr.includes(courseName) && s.status !== 'graduated';
            return isEnrolled && isStudentScheduledOnDate(s, courseName, curDayName);
        });

        let presentCount = 0;
        let leaveCount = 0;
        let html = '';

        courseStudents.forEach((stu, idx) => {
            const key = `${dateStr}_${courseName}_${stu.name}`;
            const record = window.state.attendanceData[key] || { status: '未到', time: '', reason: '' };
            if (record.status === '出席') presentCount++;
            if (record.status === '請假') leaveCount++;

            const phone = getParentPhone(stu);
            const isPresent = record.status === '出席';
            const isLeave = record.status === '請假';

            const customDays = (stu.courseScheduleDays && stu.courseScheduleDays[courseName]) || '';
            const customDayBadge = customDays ? `<span style="background:#e0e7ff; color:#3730a3; padding:1px 6px; border-radius:4px; font-size:11px; font-weight:bold; margin-left:6px;">固定到班：${customDays}</span>` : '';

            html += `
                <div style="background:#fff; border:1.5px solid ${isPresent ? '#2ecc71' : (isLeave ? '#e74c3c' : '#cbd5e1')}; border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-size:11.5px; color:#888; font-weight:bold;">#${idx+1}</span>
                            <b style="font-size:15px; color:var(--primary); margin-left:4px;">${stu.name}</b>
                            ${customDayBadge}
                            ${stu.pickupNotes ? `<span style="background:#fdf2f8; border:1px solid #fbcfe8; color:#9d174d; padding:1px 6px; border-radius:4px; font-size:11.5px; font-weight:bold; margin-left:6px;">🚗 ${stu.pickupNotes}</span>` : ''}
                            <span style="font-size:12px; color:#555; margin-left:8px;">🏫 ${stu.school || '-'}</span>
                        </div>
                        <div style="font-size:12px; color:#475569;">📞 ${phone}</div>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <button class="btn ${isPresent ? 'btn-success' : 'btn-primary'}" style="flex:1; min-width:110px; padding:7px; font-size:13px;" onclick="setAttendance('${key}', '出席')">
                            ${isPresent ? '✔ 今日已到班' : '點名 (✔)'}
                        </button>
                        <button class="btn btn-warning" style="flex:1; min-width:90px; padding:7px; font-size:13px;" onclick="setAttendance('${key}', '請假')">
                            ${isLeave ? '▲ 已請假' : '請假 (▲)'}
                        </button>
                        <input type="text" placeholder="請輸入請假原因..." value="${record.reason || ''}" style="flex:2; min-width:180px; padding:6px 10px; border:1px solid #ccc; border-radius:6px; margin:0; font-size:13px;" onchange="saveReason('${key}', this.value)">
                    </div>
                </div>
            `;
        });

        if (courseStudents.length === 0) {
            html = `<p style="text-align:center; color:#888; padding:20px;">此班級本日無排課學生。</p>`;
        }

        statsEl.innerText = `應到：${courseStudents.length} 人 ｜ 出席：${presentCount} 人 ｜ 請假：${leaveCount} 人`;
        container.innerHTML = html;
    }

    window.renderAbsentAlertTab = function() {
        const dateStr = document.getElementById('alertDateInput').value;
        const summary = getAbsentAndUncheckedSummary(dateStr);
        const container = document.getElementById('alertTabContainer');
        if (!container) return;

        let html = `<div style="margin-top:10px;">`;

        html += `<h4 style="color:var(--primary); font-size:15px; border-bottom:2px solid #cbd5e1; padding-bottom:6px; margin-bottom:10px;">🏫 今日尚無點名記錄的班級 (${summary.unassignedClasses.length}班) <span style="font-size:12px; color:#666; font-weight:normal;">(點擊班級可直接展開該班學生名冊進行點名)</span></h4>`;
        if (summary.unassignedClasses.length === 0) {
            html += `<p style="color:#16a34a; font-weight:bold; font-size:13.5px; margin-bottom:15px;">✔ 今日所有排課班級皆已有老師進行點名作業！</p>`;
        } else {
            html += `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:15px;">`;
            summary.unassignedClasses.forEach(cName => {
                html += `<button class="btn" style="background:#fef2f2; border:1px solid #fca5a5; color:#991b1b; padding:8px 12px; border-radius:6px; font-weight:bold; font-size:13.5px; cursor:pointer;" onclick="openQuickRollModal('${cName}', '${dateStr}')">🏫 ${cName} (尚未點名) ➔</button>`;
            });
            html += `</div>`;
        }

        html += `<h4 style="color:var(--primary); font-size:15px; border-bottom:2px solid #cbd5e1; padding-bottom:6px; margin-bottom:10px; margin-top:20px;">👥 今日各班尚未到班 / 請假 / 未點名學員名冊 <span style="font-size:12px; color:#666; font-weight:normal;">(點擊狀態按鈕可直接登記原因與連絡結果)</span></h4>`;
        
        let actionableStudents = summary.absentStudentsList;

        if (actionableStudents.length === 0) {
            html += `<p style="color:#16a34a; font-weight:bold; font-size:13.5px;">🌟 今日所有學生皆已順利出席點名！</p>`;
        } else {
            html += `<table>
                <thead>
                    <tr>
                        <th style="width:40px;">序</th>
                        <th style="width:100px;">學生姓名</th>
                        <th style="width:130px;">所屬班級</th>
                        <th style="width:100px;">就讀學校</th>
                        <th style="width:120px;">家長電話</th>
                        <th style="width:110px;">點名狀態</th>
                        <th style="width:200px;">請假原因 / 連絡結果紀錄</th>
                    </tr>
                </thead>
                <tbody>`;

            actionableStudents.forEach((item, idx) => {
                const stu = item.student;
                const phone = getParentPhone(stu);
                let badgeColor = '#b91c1c';
                let badgeBg = '#fee2e2';
                let badgeBorder = '#fca5a5';
                if (item.status === '請假') {
                    badgeColor = '#b45309';
                    badgeBg = '#fef3c7';
                    badgeBorder = '#f59e0b';
                } else if (item.status === '出席') {
                    badgeColor = '#15803d';
                    badgeBg = '#dcfce7';
                    badgeBorder = '#86efac';
                }

                html += `<tr>
                    <td><b>${idx + 1}</b></td>
                    <td><b style="color:var(--primary);">${stu.name}</b></td>
                    <td><span class="course-tag">${item.courseName}</span></td>
                    <td>${stu.school || '-'}</td>
                    <td style="font-size:12.5px;">${phone}</td>
                    <td>
                        <button class="btn" style="padding:4px 8px; font-size:12px; font-weight:bold; background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder}; cursor:pointer;" onclick="openAbsentReasonModal('${dateStr}', '${item.courseName}', '${stu.name}', '${phone}', '${item.status}', '${item.reason.replace(/'/g, "\\'")}')">
                            ${item.status} ✏️
                        </button>
                    </td>
                    <td style="text-align:left; font-size:12.5px; color:#475569;">${item.reason ? `📝 ${item.reason}` : '<span style="color:#aaa;">(尚未填寫原因)</span>'}</td>
                </tr>`;
            });

            html += `</tbody></table>`;
        }

        html += `</div>`;
        container.innerHTML = html;
    };

    window.openAbsentReasonModal = function(dateStr, courseName, studentName, phone, currentStatus, currentReason) {
        document.getElementById('modalDateStr').value = dateStr;
        document.getElementById('modalCourseName').value = courseName;
        document.getElementById('modalStudentName').value = studentName;

        document.getElementById('modalDisplayStuName').innerText = studentName;
        document.getElementById('modalDisplayCourseName').innerText = courseName;
        document.getElementById('modalDisplayPhone').innerText = phone;

        document.getElementById('modalStatusSelect').value = currentStatus === '尚未點名' ? '未到' : currentStatus;
        document.getElementById('modalReasonText').value = currentReason || '';

        document.getElementById('absentReasonModal').style.display = 'flex';
    };

    window.saveAbsentReasonModal = async function() {
        disableButton('btnSaveAbsent');
        
        const dateStr = document.getElementById('modalDateStr').value;
        const courseName = document.getElementById('modalCourseName').value;
        const studentName = document.getElementById('modalStudentName').value;
        const newStatus = document.getElementById('modalStatusSelect').value;
        const reasonText = document.getElementById('modalReasonText').value.trim();

        const key = `${dateStr}_${courseName}_${studentName}`;
        if (!window.state.attendanceData[key]) window.state.attendanceData[key] = {};

        window.state.attendanceData[key].status = newStatus;
        window.state.attendanceData[key].reason = reasonText;
        if (!window.state.attendanceData[key].time && newStatus !== '未到') {
            const utc = new Date().getTime() + (new Date().getTimezoneOffset() * 60000);
            const taiwanTime = new Date(utc + (3600000 * 8));
            window.state.attendanceData[key].time = taiwanTime.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        // 強制立即同步
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
        try {
            await setDoc(doc(db, "classLogSettings", "attendance"), { data: window.state.attendanceData });
            document.getElementById('absentReasonModal').style.display = 'none';
            showToast(`✅ 已成功儲存【${studentName}】的請假原因與連絡結果！`, 'success');
            renderAbsentAlertTab();
            updateHomeAlertBanner();
        } catch (e) {
            showToast('儲存失敗！', 'error');
        } finally {
            enableButton('btnSaveAbsent');
        }
    };

    window.onSheetCourseChanged = function() {
        const courseName = window.state.selectedSheetCourse;
        const allCourses = getAllCoursesList();
        const course = allCourses.find(c => c.name === courseName) || allCourses[0];
        if (!course) return;

        document.getElementById('sheetPeriodBadge').innerText = `上課日：${course.day || '未設定'}`;

        const baseStart = course.startDate || getTaiwanDateString();
        document.getElementById('sheetQueryStartDate').value = baseStart;
        
        const defaultEnd = course.endDate || new Date(new Date(baseStart).getTime() + 8 * 7 * 86400000).toISOString().slice(0, 10);
        document.getElementById('sheetQueryEndDate').value = defaultEnd;

        generateCustomSheet();
    };

    window.generateCustomSheet = function() {
        const courseName = window.state.selectedSheetCourse;
        const allCourses = getAllCoursesList();
        const course = allCourses.find(c => c.name === courseName) || allCourses[0];
        if (!course) return;

        let startVal = document.getElementById('sheetQueryStartDate').value;
        let endVal = document.getElementById('sheetQueryEndDate').value;

        if (!startVal) {
            startVal = course.startDate || getTaiwanDateString();
            document.getElementById('sheetQueryStartDate').value = startVal;
        }
        if (!endVal) {
            endVal = course.endDate || new Date(new Date(startVal).getTime() + 8 * 7 * 86400000).toISOString().slice(0, 10);
            document.getElementById('sheetQueryEndDate').value = endVal;
        }

        const courseStudents = window.state.students.filter(s => {
            const arr = getStudentCoursesArray(s);
            return arr.includes(course.name) && s.status !== 'graduated';
        });

        const courseDaysStr = course.day || '';
        const targetWeekDays = WEEK_DAYS.filter(d => courseDaysStr.includes(d) || courseDaysStr.includes(d.replace('星期', '週')));

        let dateList = [];
        let cur = new Date(startVal);
        const endDateObj = new Date(endVal);

        while (cur <= endDateObj && dateList.length < 100) {
            let dayIndex = cur.getDay(); 
            let dayName = dayIndex === 0 ? '星期日' : WEEK_DAYS[dayIndex - 1];

            if (targetWeekDays.length === 0 || targetWeekDays.includes(dayName)) {
                let dateStr = cur.toISOString().slice(0, 10);
                let holidayMatch = window.state.holidays.find(h => h.date === dateStr);
                dateList.push({
                    dateStr: dateStr,
                    shortDate: `${cur.getMonth()+1}/${cur.getDate()}`,
                    dayName: dayName.replace('星期', '週'),
                    fullDayName: dayName,
                    holiday: holidayMatch ? holidayMatch.name : null
                });
            }
            cur.setDate(cur.getDate() + 1);
        }

        if (dateList.length === 0) {
            dateList.push({ dateStr: startVal, shortDate: startVal.slice(5), dayName: '', fullDayName: '', holiday: null });
        }

        const actualEndStr = dateList[dateList.length - 1].dateStr;

        document.getElementById('sheetPrintTitle').innerText = `斗六顧德補習班 - ${course.name} 點名總表`;
        document.getElementById('sheetPrintSub').innerText = 
            `上課星期：${course.day || '自訂'} | 查詢：${startVal} 至 ${actualEndStr} | 教師：${course.teacher || '老師'}`;

        let html = `<table>
            <thead>
                <tr>
                    <th style="width:30px;">序</th>
                    <th style="width:85px;">學生姓名</th>
                    <th style="width:85px;">學校年級</th>
                    <th style="width:110px;">主要電話</th>`;

        dateList.forEach((d) => {
            html += `<th style="width:48px;" class="${d.holiday ? 'holiday-col' : ''}">
                ${d.shortDate}<br><span style="font-size:7pt;">${d.dayName}</span>
                ${d.holiday ? `<div style="font-size:6.5pt; color:#856404;">${d.holiday}</div>` : ''}
            </th>`;
        });

        html += `<th style="width:80px;">備註/請假原因</th></tr></thead><tbody>`;

        courseStudents.forEach((stu, idx) => {
            const phone = getParentPhone(stu);
            html += `<tr>
                <td>${idx + 1}</td>
                <td><b>${stu.name}</b></td>
                <td>${stu.school || '-'}</td>
                <td style="font-size:8pt;">${phone}</td>`;

            let reasonsArr = [];

            dateList.forEach(d => {
                if (d.holiday) {
                    html += `<td class="holiday-col" style="font-size:7.5pt;">放假</td>`;
                } else {
                    const isScheduled = isStudentScheduledOnDate(stu, course.name, d.fullDayName);
                    
                    if (!isScheduled) {
                        html += `<td style="background:#f1f5f9; color:#94a3b8; font-size:9pt;" title="非到班日">—</td>`;
                    } else {
                        const key = `${d.dateStr}_${course.name}_${stu.name}`;
                        const rec = window.state.attendanceData[key];
                        let mark = '';
                        if (rec) {
                            mark = rec.status === '請假' ? '<span style="color:#e74c3c;font-weight:bold;font-size:11pt;">▲</span>' : (rec.status === '出席' ? '<span style="color:#16a34a;font-weight:bold;font-size:11pt;">✔</span>' : '');
                            if (rec.status === '請假' && rec.reason) {
                                reasonsArr.push(`${d.shortDate}${rec.reason}`);
                            }
                        }

                        html += `<td>
                            <div style="height:20px; line-height:20px;">${mark}</div>
                        </td>`;
                    }
                }
            });

            html += `<td style="font-size:7.5pt; text-align:left; color:#b91c1c;">${reasonsArr.join('、')}</td></tr>`;
        });

        html += `</tbody></table>`;
        document.getElementById('sheetTableContainer').innerHTML = html;
    };

    function renderConfigFilterButtons() {
        const container = document.getElementById('configFilterGroup');
        if (!container) return;
        container.innerHTML = '';

        window.state.configFilterOrder.forEach((item) => {
            const btn = document.createElement('div');
            btn.className = `filter-pill ${window.state.configDeptFilter === item.key ? 'active' : ''}`;
            btn.innerText = item.label;
            btn.onclick = () => setConfigDeptFilter(item.key);
            container.appendChild(btn);
        });
    }

    window.setConfigDeptFilter = function(filterKey) {
        window.state.configDeptFilter = filterKey;
        renderConfigFilterButtons();
        renderCourseConfigList();
    };

    function renderCourseConfigList() {
        const container = document.getElementById('courseConfigList');
        if (!container) return;
        const allCourses = getAllCoursesList();
        const curFilter = window.state.configDeptFilter || 'all';

        let filteredCourses = allCourses;
        if (curFilter !== 'all') filteredCourses = allCourses.filter(c => c.dept === curFilter);

        let html = `<table>
            <thead>
                <tr>
                    <th style="width:180px;">課程名稱</th>
                    <th style="width:80px;">部門</th>
                    <th style="width:130px;">上課星期</th>
                    <th style="width:125px;">開課日起</th>
                    <th style="width:125px;">結束日期</th>
                </tr>
            </thead>
            <tbody>`;

        if (filteredCourses.length === 0) {
            html += `<tr><td colspan="5" style="padding:20px; color:#888;">此分類目前尚無班級。</td></tr>`;
        } else {
            filteredCourses.forEach(c => {
                const deptName = c.dept === 'care' ? '課輔部' : (c.dept === 'elementary' ? '國小部' : '國中部');
                html += `<tr>
                    <td><b>${c.name}</b></td>
                    <td>${deptName}</td>
                    <td style="font-size:12px; color:#555;">${c.day || '未設定(無排課)'}</td>
                    <td>
                        <input type="date" value="${c.startDate || ''}" onchange="updateCourseDate('${c.dept}', '${c.name}', 'startDate', this.value)" style="padding:5px; border-radius:4px; border:1px solid #ccc; width:115px; margin:0; font-size:13px;">
                    </td>
                    <td>
                        <input type="date" value="${c.endDate || ''}" onchange="updateCourseDate('${c.dept}', '${c.name}', 'endDate', this.value)" style="padding:5px; border-radius:4px; border:1px solid #ccc; width:115px; margin:0; font-size:13px;">
                    </td>
                </tr>`;
            });
        }

        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    window.updateCourseDate = function(dept, courseName, field, value) {
        const list = window.state.courses[dept];
        if (!list) return;
        const target = list.find(c => (typeof c === 'object' ? c.name : c) === courseName);
        if (target && typeof target === 'object') target[field] = value;
    };

    window.saveAllCourseConfigs = async function() {
        if (!checkPassword("🔒 修改課程起訖日，請輸入管理密碼：")) return;

        disableButton('btnSaveAllConfigs');
        try {
            await setDoc(doc(db, "classLogSettings", "courses"), { data: window.state.courses });
            showToast("✅ 所有課程起訖日設定已儲存並同步！", "success");
            renderCourseCards();
            renderCourseConfigList();
        } catch (e) {
            console.error(e);
            showToast("❌ 儲存失敗！", "error");
        } finally {
            enableButton('btnSaveAllConfigs');
        }
    };

    window.verifyAndAddHoliday = async function() {
        const date = document.getElementById('newHolidayDate').value;
        const name = document.getElementById('newHolidayName').value.trim();
        if (!date || !name) return showToast('請輸入完整日期與事由！', 'error');

        disableButton('btnAddHoliday', '新增中');
        try {
            window.state.holidays.push({ date, name });
            await saveHolidaysToCloud();
            document.getElementById('newHolidayName').value = '';
            renderHolidayList();
            showToast(`✅ 已成功設定放假：${date} 【${name}】`, "success");
        } catch (e) {
            showToast('新增放假失敗！', 'error');
        } finally {
            enableButton('btnAddHoliday');
        }
    };

    function renderHolidayList() {
        const div = document.getElementById('holidayListDiv');
        if (!div) return;
        if (window.state.holidays.length === 0) {
            div.innerHTML = '<p style="color:#888; font-size:13.5px;">目前無設定任何放假日期。';
            return;
        }
        let html = '<table><tr><th>放假日期</th><th>放假事由</th><th>操作</th></tr>';
        window.state.holidays.forEach((h, idx) => {
            html += `<tr>
                <td><b>${h.date}</b></td>
                <td>${h.name}</td>
                <td><button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="deleteHoliday(${idx})">刪除</button></td>
            </tr>`;
        });
        html += '</table>';
        div.innerHTML = html;
    }

    window.deleteHoliday = async function(idx) {
        if (!confirm('確定要刪除此放假設定嗎？')) return;
        window.state.holidays.splice(idx, 1);
        await saveHolidaysToCloud();
        renderHolidayList();
        showToast('✅ 已刪除放假設定', 'success');
    };
