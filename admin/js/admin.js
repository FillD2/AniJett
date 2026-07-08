(function() {
    'use strict';

    // Проверка авторизации (имитация)
    if (sessionStorage.getItem('admin_logged_in') !== 'true' && !window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html';
        return;
    }

    // Выход
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sessionStorage.removeItem('admin_logged_in');
            window.location.href = 'login.html';
        });
    }

    // ========== МОКОВЫЕ ДАННЫЕ ==========
    const mockAnime = [
        { id: 1, title: 'Атака Титанов: Финал', poster: '../img/posters/aot.jpg', year: 2023, status: 'Завершён' },
        { id: 2, title: 'Магическая битва 2', poster: '../img/posters/jjk.jpg', year: 2023, status: 'Онгоинг' },
        { id: 3, title: 'Ванпанчмен 3', poster: '../img/posters/opm.jpg', year: 2024, status: 'Анонс' },
        { id: 4, title: 'Клинок, рассекающий демонов 4', poster: '../img/posters/demonslayer.jpg', year: 2024, status: 'Онгоинг' },
        { id: 5, title: 'Человек-бензопила', poster: '../img/posters/chainsaw.jpg', year: 2022, status: 'Завершён' },
        { id: 6, title: 'Невинный панк: Механическая девушка', poster: '../img/posters/innocentpunk.jpg', year: 2025, status: 'Вышел' }
    ];

    const mockUsers = [
        { id: 1, nickname: 'AnimeFan42', email: 'fan42@mail.ru', role: 'user', banned: false },
        { id: 2, nickname: 'Kirito2000', email: 'kirito@mail.ru', role: 'user', banned: false },
        { id: 3, nickname: 'SakuraChan', email: 'sakura@mail.ru', role: 'user', banned: false },
        { id: 4, nickname: 'Admin', email: 'admin@anijett.local', role: 'admin', banned: false }
    ];

    const mockComments = [
        { id: 1, author: 'AnimeFan42', anime: 'Атака Титанов: Финал', text: 'Офигенное аниме!', date: '2025-04-18 14:23' },
        { id: 2, author: 'Kirito2000', anime: 'Магическая битва 2', text: 'Графика на высоте', date: '2025-04-18 09:15' },
        { id: 3, author: 'SakuraChan', anime: 'Клинок, рассекающий демонов 4', text: 'Музыка божественная', date: '2025-04-17 20:45' },
        { id: 4, author: 'AnimeFan42', anime: 'Человек-бензопила', text: 'Жду продолжения', date: '2025-04-16 11:30' }
    ];

    const mockReports = [
        { id: 1, type: 'Комментарий', target: 'ID 12', reporter: 'SakuraChan', reason: 'Спойлер', status: 'pending' },
        { id: 2, type: 'Пользователь', target: 'Kirito2000', reporter: 'AnimeFan42', reason: 'Оскорбление', status: 'pending' },
        { id: 3, type: 'Комментарий', target: 'ID 45', reporter: 'Kirito2000', reason: 'Спам', status: 'resolved' },
        { id: 4, type: 'Комментарий', target: 'ID 78', reporter: 'AnimeFan42', reason: 'Флуд', status: 'pending' }
    ];

    // ========== ФУНКЦИИ ЗАГРУЗКИ ТАБЛИЦ ==========
    function loadAnimeTable() {
        const animeTableBody = document.getElementById('animeTableBody');
        if (!animeTableBody) return;
        animeTableBody.innerHTML = mockAnime.map(a => `
            <tr>
                <td>${a.id}</td>
                <td><img src="${a.poster}" style="width: 40px; height: 60px; object-fit: cover; border-radius: 6px;" onerror="this.src='https://via.placeholder.com/40x60/1a1a20/ff5e57?text=Anime'"></td>
                <td>${a.title}</td>
                <td>${a.year}</td>
                <td>${a.status}</td>
                <td>
                    <button class="icon-btn edit-anime" data-id="${a.id}"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn delete-anime" data-id="${a.id}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('.edit-anime').forEach(btn => {
            btn.addEventListener('click', () => alert('Редактирование (демо)'));
        });
        document.querySelectorAll('.delete-anime').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Удалить аниме?')) alert('Удалено (демо)');
            });
        });
    }

    function loadUsersTable() {
        const usersTableBody = document.getElementById('usersTableBody');
        if (!usersTableBody) return;
        usersTableBody.innerHTML = mockUsers.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.nickname}</td>
                <td>${u.email}</td>
                <td>${u.role}</td>
                <td>${u.banned ? 'Забанен' : 'Активен'}</td>
                <td>
                    <button class="icon-btn"><i class="fas fa-ban"></i></button>
                    <button class="icon-btn"><i class="fas fa-user-shield"></i></button>
                </td>
            </tr>
        `).join('');
    }

    function loadCommentsTable() {
        const commentsTableBody = document.getElementById('commentsTableBody');
        if (!commentsTableBody) return;
        commentsTableBody.innerHTML = mockComments.map(c => `
            <tr>
                <td>${c.id}</td>
                <td>${c.author}</td>
                <td>${c.anime}</td>
                <td>${c.text}</td>
                <td>${c.date}</td>
                <td>
                    <button class="icon-btn"><i class="fas fa-check"></i></button>
                    <button class="icon-btn"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
        commentsTableBody.querySelectorAll('.icon-btn').forEach(btn => {
            btn.addEventListener('click', () => alert('Действие выполнено (демо)'));
        });
    }

    function loadReportsTable() {
        const reportsTableBody = document.getElementById('reportsTableBody');
        if (!reportsTableBody) return;
        reportsTableBody.innerHTML = mockReports.map(r => `
            <tr>
                <td>${r.id}</td>
                <td>${r.type}</td>
                <td>${r.target}</td>
                <td>${r.reporter}</td>
                <td>${r.reason}</td>
                <td><span class="status-badge ${r.status}">${r.status === 'pending' ? 'Новая' : 'Решена'}</span></td>
                <td>
                    <button class="icon-btn"><i class="fas fa-check-circle"></i></button>
                    <button class="icon-btn"><i class="fas fa-times-circle"></i></button>
                </td>
            </tr>
        `).join('');
        reportsTableBody.querySelectorAll('.icon-btn').forEach(btn => {
            btn.addEventListener('click', () => alert('Статус изменён (демо)'));
        });
    }

    // ========== ИНИЦИАЛИЗАЦИЯ ПОСЛЕ ЗАГРУЗКИ DOM ==========
    document.addEventListener('DOMContentLoaded', () => {
        loadAnimeTable();
        loadUsersTable();
        loadCommentsTable();
        loadReportsTable();

        // Модальное окно добавления аниме
        const modal = document.getElementById('animeModal');
        const addBtn = document.getElementById('addAnimeBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                modal.classList.remove('hidden');
            });
        }
        const closeModal = () => modal.classList.add('hidden');
        const closeBtn = modal?.querySelector('.modal-close');
        const cancelBtn = document.getElementById('cancelBtn');
        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        const animeForm = document.getElementById('animeForm');
        if (animeForm) {
            animeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                alert('Аниме добавлено (демо)');
                closeModal();
            });
        }

        console.log('Админ-панель AniJett (оболочка) загружена');
    });
})();