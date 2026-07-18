/* ==========================================================================
   飞牛图书 · 家庭读书数据中心
   前端应用 - 原生 JavaScript 实现
   ========================================================================== */

'use strict';

/* ============================================================
   1. API 全局对象 - fetch 封装，自动携带 token
   ============================================================ */
const API = {
    baseUrl: '/api',

    /**
     * 获取完整 URL
     */
    _url(path) {
        return this.baseUrl + path;
    },

    /**
     * 获取认证 headers
     */
    _headers(extra = {}) {
        const headers = { ...extra };
        const token = DataStore.token;
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }
        return headers;
    },

    /**
     * 统一请求方法
     */
    async _request(method, path, { body, params, isForm, headers } = {}) {
        let url = this._url(path);
        if (params) {
            const search = new URLSearchParams();
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') {
                    search.append(k, v);
                }
            });
            const qs = search.toString();
            if (qs) url += (url.includes('?') ? '&' : '?') + qs;
        }

        const opts = {
            method,
            headers: {},
        };

        if (body !== undefined && body !== null) {
            if (isForm) {
                opts.body = body; // FormData
            } else {
                opts.headers['Content-Type'] = 'application/json';
                opts.body = JSON.stringify(body);
            }
        }

        Object.assign(opts.headers, this._headers(headers || {}));

        let resp;
        try {
            resp = await fetch(url, opts);
        } catch (e) {
            throw new Error('网络连接失败，请检查服务器是否启动');
        }

        // 401 未授权 - 清除 token 跳转登录
        if (resp.status === 401) {
            DataStore.clearAuth();
            App.showLogin();
            const err = new Error('登录已过期，请重新登录');
            err.status = 401;
            throw err;
        }

        // 处理不同响应类型
        const contentType = resp.headers.get('content-type') || '';
        let data;
        if (contentType.includes('application/json')) {
            data = await resp.json();
        } else if (contentType.includes('text/')) {
            data = await resp.text();
        } else {
            data = resp;
        }

        if (!resp.ok) {
            const msg = (data && (data.detail || data.message)) || `请求失败 (${resp.status})`;
            const err = new Error(msg);
            err.status = resp.status;
            err.data = data;
            throw err;
        }

        return data;
    },

    get(path, params) { return this._request('GET', path, { params }); },
    post(path, body, isForm = false) { return this._request('POST', path, { body, isForm }); },
    put(path, body, isForm = false) { return this._request('PUT', path, { body, isForm }); },
    delete(path) { return this._request('DELETE', path); },

    /* ---- 认证 ---- */
    auth: {
        login(username, password) {
            return API.post('/auth/login', { username, password });
        },
        register(data) {
            return API.post('/auth/register', data);
        },
    },

    /* ---- 用户 ---- */
    users: {
        me() { return API.get('/users/me'); },
        update(data) { return API.put('/users/me', data); },
    },

    /* ---- 图书 ---- */
    books: {
        list(params) { return API.get('/books', params); },
        get(id) { return API.get(`/books/${id}`); },
        create(formData) { return API.post('/books', formData, true); },
        update(id, data) { return API.put(`/books/${id}`, data); },
        delete(id) { return API.delete(`/books/${id}`); },
        coverUrl(id) {
            return API.baseUrl + `/books/${id}/cover?t=${Date.now()}`;
        },
        downloadUrl(id) {
            return API.baseUrl + `/books/${id}/download`;
        },
    },

    /* ---- 阅读进度 ---- */
    progress: {
        list() { return API.get('/progress'); },
        get(bookId) { return API.get(`/progress/${bookId}`); },
        update(bookId, data) { return API.put(`/progress/${bookId}`, data); },
        delete(bookId) { return API.delete(`/progress/${bookId}`); },
    },

    /* ---- 笔记 ---- */
    notes: {
        list(bookId) { return API.get('/notes', bookId ? { book_id: bookId } : {}); },
        create(data) { return API.post('/notes', data); },
        update(id, data) { return API.put(`/notes/${id}`, data); },
        delete(id) { return API.delete(`/notes/${id}`); },
    },

    /* ---- 分类 ---- */
    categories: {
        tree() { return API.get('/categories'); },
        create(data) { return API.post('/categories', data); },
        update(id, data) { return API.put(`/categories/${id}`, data); },
        delete(id) { return API.delete(`/categories/${id}`); },
    },
};


/* ============================================================
   2. DataStore - 全局状态管理
   ============================================================ */
const DataStore = {
    token: localStorage.getItem('fc_token') || '',
    currentUser: JSON.parse(localStorage.getItem('fc_user') || 'null'),
    currentPage: 'library',

    // 图书库
    books: [],
    booksTotal: 0,
    booksPage: 1,
    booksPageSize: 20,
    booksTotalPages: 1,
    bookSearch: '',
    bookFormat: '',
    bookCategory: '',

    // 进度
    progressList: [],

    // 笔记
    notesList: [],

    // 分类
    categoryTree: [],

    setToken(token) {
        this.token = token;
        if (token) localStorage.setItem('fc_token', token);
        else localStorage.removeItem('fc_token');
    },

    setUser(user) {
        this.currentUser = user;
        if (user) localStorage.setItem('fc_user', JSON.stringify(user));
        else localStorage.removeItem('fc_user');
    },

    clearAuth() {
        this.token = '';
        this.currentUser = null;
        localStorage.removeItem('fc_token');
        localStorage.removeItem('fc_user');
    },

    get isLoggedIn() {
        return !!(this.token && this.currentUser);
    },
};


/* ============================================================
   3. 工具函数
   ============================================================ */
const Utils = {
    /**
     * HTML 转义，防止 XSS
     */
    escape(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '—';
        const now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
        if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
        if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
        const Y = d.getFullYear();
        const M = String(d.getMonth() + 1).padStart(2, '0');
        const D = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${Y}-${M}-${D} ${h}:${m}`;
    },

    /**
     * 格式化阅读时长（秒转时分）
     */
    formatReadTime(seconds) {
        if (!seconds || seconds <= 0) return '0 分钟';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h} 小时 ${m} 分钟`;
        if (m > 0) return `${m} 分钟`;
        return `${seconds} 秒`;
    },

    /**
     * 格式化文件大小
     */
    formatSize(bytes) {
        if (!bytes) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
        return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    },

    /**
     * 获取进度条颜色级别
     */
    progressClass(percent) {
        if (percent >= 100) return 'done';
        if (percent >= 70) return 'high';
        if (percent >= 30) return 'mid';
        return 'low';
    },

    /**
     * 防抖
     */
    debounce(fn, delay = 300) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * 获取文件扩展名（小写）
     */
    getExtension(filename) {
        const idx = filename.lastIndexOf('.');
        if (idx < 0) return '';
        return filename.substring(idx + 1).toLowerCase();
    },
};


/* ============================================================
   4. 主应用对象 App
   ============================================================ */
const App = {

    /* ---- 初始化 ---- */
    init() {
        this.bindLoginEvents();
        this.bindAppEvents();

        if (DataStore.isLoggedIn) {
            this.showApp();
            this.handleHashChange();
            this.loadSidebarInfo();
        } else {
            this.showLogin();
        }
    },

    /* ---- 显示登录页 ---- */
    showLogin() {
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('appPage').style.display = 'none';
        DataStore.clearAuth();
    },

    /* ---- 显示主应用 ---- */
    showApp() {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('appPage').style.display = 'flex';
        this.updateUserHeader();
    },

    /* ---- 更新用户头部信息 ---- */
    updateUserHeader() {
        const user = DataStore.currentUser;
        if (!user) return;
        document.getElementById('headerUserName').textContent = user.nickname || user.username;
        const avatar = document.getElementById('headerAvatar');
        const fallback = avatar.nextElementSibling;
        if (user.avatar) {
            avatar.src = user.avatar;
            avatar.style.display = 'block';
            fallback.style.display = 'none';
        } else {
            avatar.style.display = 'none';
            fallback.style.display = 'flex';
            fallback.innerHTML = '<i class="fa-solid fa-user"></i>';
        }
    },

    /* ---- 绑定登录页事件 ---- */
    bindLoginEvents() {
        // Tab 切换
        document.querySelectorAll('.login-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.login-form').forEach(f => f.classList.remove('active'));
                tab.classList.add('active');
                const tabName = tab.dataset.tab;
                document.getElementById(tabName === 'login' ? 'loginForm' : 'registerForm').classList.add('active');
            });
        });

        // 登录提交
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            if (!username || !password) {
                Toast.warning('请输入用户名和密码');
                return;
            }
            try {
                Loading.show('正在登录...');
                const data = await API.auth.login(username, password);
                DataStore.setToken(data.access_token);
                DataStore.setUser(data.user);
                Toast.success('登录成功，欢迎回来！');
                this.showApp();
                this.loadSidebarInfo();
                location.hash = '#library';
                this.handleHashChange();
            } catch (err) {
                Toast.error(err.message || '登录失败');
            } finally {
                Loading.hide();
            }
        });

        // 注册提交
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('regUsername').value.trim();
            const password = document.getElementById('regPassword').value;
            const nickname = document.getElementById('regNickname').value.trim();
            if (!username || username.length < 3) {
                Toast.warning('用户名至少 3 个字符');
                return;
            }
            if (!password || password.length < 6) {
                Toast.warning('密码至少 6 个字符');
                return;
            }
            try {
                Loading.show('正在注册...');
                await API.auth.register({ username, password, nickname: nickname || undefined });
                Toast.success('注册成功，请使用新账号登录');
                // 切回登录 Tab，并预填用户名
                document.querySelector('.login-tab[data-tab="login"]').click();
                document.getElementById('loginUsername').value = username;
                document.getElementById('loginPassword').value = '';
            } catch (err) {
                Toast.error(err.message || '注册失败');
            } finally {
                Loading.hide();
            }
        });
    },

    /* ---- 绑定主应用事件 ---- */
    bindAppEvents() {
        // 登出
        document.getElementById('logoutBtn').addEventListener('click', () => {
            Modal.confirm('确定要登出吗？', '登出确认', () => {
                DataStore.clearAuth();
                Toast.success('已安全登出');
                this.showLogin();
            });
        });

        // 侧边栏切换（移动端）
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('open');
            let overlay = document.querySelector('.sidebar-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'sidebar-overlay';
                overlay.addEventListener('click', () => {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('show');
                });
                document.body.appendChild(overlay);
            }
            overlay.classList.toggle('show', sidebar.classList.contains('open'));
        });

        // hash 路由
        window.addEventListener('hashchange', () => this.handleHashChange());

        // 侧边栏导航点击后关闭（移动端）
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar').classList.remove('open');
                    const overlay = document.querySelector('.sidebar-overlay');
                    if (overlay) overlay.classList.remove('show');
                }
            });
        });
    },

    /* ---- 处理 hash 路由变化 ---- */
    handleHashChange() {
        const hash = location.hash.replace('#', '') || 'library';
        const validRoutes = ['library', 'progress', 'notes', 'categories', 'settings'];
        const route = validRoutes.includes(hash) ? hash : 'library';
        DataStore.currentPage = route;

        // 更新导航高亮
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.route === route);
        });

        // 关闭移动端侧边栏
        document.getElementById('sidebar').classList.remove('open');
        const overlay = document.querySelector('.sidebar-overlay');
        if (overlay) overlay.classList.remove('show');

        // 渲染对应页面
        const main = document.getElementById('mainContent');
        main.innerHTML = '';
        main.scrollTop = 0;

        try {
            switch (route) {
                case 'library': Pages.library.render(main); break;
                case 'progress': Pages.progress.render(main); break;
                case 'notes': Pages.notes.render(main); break;
                case 'categories': Pages.categories.render(main); break;
                case 'settings': Pages.settings.render(main); break;
            }
        } catch (err) {
            console.error(err);
            main.innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>页面加载失败</h3>
                <p>${Utils.escape(err.message)}</p>
            </div>`;
        }
    },

    /* ---- 加载侧边栏信息（图书数量） ---- */
    async loadSidebarInfo() {
        try {
            const data = await API.books.list({ page: 1, page_size: 1 });
            document.getElementById('sidebarBookCount').textContent = `${data.total || 0} 本藏书`;
        } catch (err) {
            // 静默失败
        }
    },
};


/* ============================================================
   5. Toast 通知
   ============================================================ */
const Toast = {
    show(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = {
            success: 'fa-circle-check',
            error: 'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info: 'fa-circle-info',
        };
        toast.innerHTML = `
            <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
            <span class="toast-message">${Utils.escape(message)}</span>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    success(msg, dur) { this.show(msg, 'success', dur); },
    error(msg, dur) { this.show(msg, 'error', dur || 4000); },
    warning(msg, dur) { this.show(msg, 'warning', dur); },
    info(msg, dur) { this.show(msg, 'info', dur); },
};


/* ============================================================
   6. Loading 遮罩
   ============================================================ */
const Loading = {
    show(text = '加载中...') {
        const overlay = document.getElementById('loadingOverlay');
        document.getElementById('loadingText').textContent = text;
        overlay.style.display = 'flex';
    },
    hide() {
        document.getElementById('loadingOverlay').style.display = 'none';
    },
};


/* ============================================================
   7. Modal 弹窗系统
   ============================================================ */
const Modal = {
    /**
     * 显示弹窗
     * options: { title, bodyHTML, footerHTML, size, onMount }
     */
    show({ title, bodyHTML, footerHTML, size = '', onMount }) {
        this.close();
        const sizeClass = size === 'lg' ? 'modal-lg' : (size === 'sm' ? 'modal-sm' : '');
        const container = document.getElementById('modalContainer');
        container.innerHTML = `
            <div class="modal-overlay" id="modalOverlay">
                <div class="modal-card ${sizeClass}">
                    <div class="modal-header">
                        <div class="modal-title">${title || ''}</div>
                        <button class="modal-close" id="modalCloseBtn" aria-label="关闭">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div class="modal-body" id="modalBody">${bodyHTML || ''}</div>
                    ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
                </div>
            </div>
        `;
        const overlay = document.getElementById('modalOverlay');
        document.getElementById('modalCloseBtn').addEventListener('click', () => this.close());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });
        document.addEventListener('keydown', this._escHandler);
        if (typeof onMount === 'function') {
            onMount(document.getElementById('modalBody'));
        }
    },

    close() {
        document.getElementById('modalContainer').innerHTML = '';
        document.removeEventListener('keydown', this._escHandler);
    },

    _escHandler(e) {
        if (e.key === 'Escape') Modal.close();
    },

    /**
     * 确认弹窗
     */
    confirm(message, title = '确认操作', onConfirm, confirmText = '确定', isDanger = false) {
        this.show({
            title,
            size: 'sm',
            bodyHTML: `<div style="padding: var(--space-sm) 0; color: var(--color-text); line-height: 1.7;">${Utils.escape(message)}</div>`,
            footerHTML: `
                <button class="btn btn-ghost" id="modalCancelBtn">取消</button>
                <button class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="modalConfirmBtn">${confirmText}</button>
            `,
            onMount: () => {
                document.getElementById('modalCancelBtn').addEventListener('click', () => this.close());
                document.getElementById('modalConfirmBtn').addEventListener('click', () => {
                    this.close();
                    if (onConfirm) onConfirm();
                });
            }
        });
    },
};


/* ============================================================
   8. 页面对象集合 - 各功能页
   ============================================================ */
const Pages = {};


/* ============================================================
   8.1 图书库页面
   ============================================================ */
Pages.library = {
    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h1 class="page-title"><i class="fa-solid fa-book"></i> 图书库</h1>
                    <p class="page-subtitle">管理家庭藏书，开启阅读之旅</p>
                </div>
            </div>
            <div class="toolbar">
                <div class="search-box">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="bookSearch" class="search-input" placeholder="搜索书名、作者..." value="${Utils.escape(DataStore.bookSearch)}">
                </div>
                <select id="formatFilter" class="filter-select">
                    <option value="">全部格式</option>
                    <option value="pdf" ${DataStore.bookFormat==='pdf'?'selected':''}>PDF</option>
                    <option value="epub" ${DataStore.bookFormat==='epub'?'selected':''}>EPUB</option>
                    <option value="mobi" ${DataStore.bookFormat==='mobi'?'selected':''}>MOBI</option>
                    <option value="azw3" ${DataStore.bookFormat==='azw3'?'selected':''}>AZW3</option>
                    <option value="txt" ${DataStore.bookFormat==='txt'?'selected':''}>TXT</option>
                </select>
                <select id="categoryFilter" class="filter-select">
                    <option value="">全部分类</option>
                </select>
                <button class="btn btn-primary" id="uploadBookBtn">
                    <i class="fa-solid fa-cloud-arrow-up"></i> 上传图书
                </button>
            </div>
            <div id="bookGridContainer">
                <div class="inline-loading"><i class="fa-solid fa-spinner"></i>正在加载图书...</div>
            </div>
            <div id="paginationContainer"></div>
        `;

        // 绑定工具栏
        const searchInput = document.getElementById('bookSearch');
        searchInput.addEventListener('input', Utils.debounce((e) => {
            DataStore.bookSearch = e.target.value;
            DataStore.booksPage = 1;
            this.loadBooks();
        }, 400));

        document.getElementById('formatFilter').addEventListener('change', (e) => {
            DataStore.bookFormat = e.target.value;
            DataStore.booksPage = 1;
            this.loadBooks();
        });

        document.getElementById('categoryFilter').addEventListener('change', (e) => {
            DataStore.bookCategory = e.target.value;
            DataStore.booksPage = 1;
            this.loadBooks();
        });

        document.getElementById('uploadBookBtn').addEventListener('click', () => this.showUploadModal());

        // 加载分类筛选
        this.loadCategoryFilter();
        // 加载图书
        this.loadBooks();
    },

    /* ---- 加载分类筛选项 ---- */
    async loadCategoryFilter() {
        try {
            const tree = await API.categories.tree();
            DataStore.categoryTree = tree || [];
            const select = document.getElementById('categoryFilter');
            if (!select) return;
            const currentVal = DataStore.bookCategory;
            let options = '<option value="">全部分类</option>';
            const walk = (nodes, depth = 0) => {
                (nodes || []).forEach(cat => {
                    const prefix = depth ? '│ '.repeat(depth) + '└ ' : '';
                    options += `<option value="${cat.id}" ${String(currentVal)===String(cat.id)?'selected':''}>${prefix}${Utils.escape(cat.name)}</option>`;
                    walk(cat.children, depth + 1);
                });
            };
            walk(tree);
            select.innerHTML = options;
        } catch (err) {
            // 静默
        }
    },

    /* ---- 加载图书列表 ---- */
    async loadBooks() {
        const container = document.getElementById('bookGridContainer');
        if (!container) return;
        container.innerHTML = '<div class="inline-loading"><i class="fa-solid fa-spinner"></i>正在加载图书...</div>';
        try {
            const data = await API.books.list({
                page: DataStore.booksPage,
                page_size: DataStore.booksPageSize,
                search: DataStore.bookSearch,
                format: DataStore.bookFormat,
                category_id: DataStore.bookCategory,
            });
            DataStore.books = data.items || [];
            DataStore.booksTotal = data.total || 0;
            DataStore.booksTotalPages = data.total_pages || 1;
            this.renderBooks();
            this.renderPagination();
        } catch (err) {
            container.innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>加载失败</h3>
                <p>${Utils.escape(err.message)}</p>
            </div>`;
        }
    },

    /* ---- 渲染图书网格 ---- */
    renderBooks() {
        const container = document.getElementById('bookGridContainer');
        if (!container) return;
        if (!DataStore.books.length) {
            container.innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-book-bookmark"></i>
                <h3>暂无图书</h3>
                <p>点击右上角"上传图书"添加第一本书</p>
            </div>`;
            return;
        }
        const html = DataStore.books.map((book, idx) => {
            const cover = book.cover
                ? `<img src="${API.books.coverUrl(book.id)}" alt="${Utils.escape(book.title)}" onerror="this.style.display='none';this.parentNode.querySelector('.book-cover-default').style.display='flex';">
                   <div class="book-cover-default" style="display:none;"><i class="fa-solid fa-book"></i></div>`
                : `<div class="book-cover-default"><i class="fa-solid fa-book"></i></div>`;
            return `
                <div class="book-card" data-id="${book.id}" style="animation-delay:${idx * 0.04}s">
                    <div class="book-cover">
                        ${cover}
                        <span class="book-format-tag format-${Utils.escape(book.format||'txt')}">${Utils.escape(book.format||'TXT')}</span>
                    </div>
                    <div class="book-info">
                        <div class="book-title">${Utils.escape(book.title)}</div>
                        <div class="book-author">${Utils.escape(book.author || '未知作者')}</div>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = `<div class="book-grid">${html}</div>`;
        container.querySelectorAll('.book-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id);
                this.showBookDetail(id);
            });
        });
    },

    /* ---- 分页 ---- */
    renderPagination() {
        const container = document.getElementById('paginationContainer');
        if (!container) return;
        if (DataStore.booksTotalPages <= 1) {
            container.innerHTML = DataStore.booksTotal > 0
                ? `<div class="pagination"><span class="page-info">共 ${DataStore.booksTotal} 本</span></div>`
                : '';
            return;
        }
        const cur = DataStore.booksPage;
        const total = DataStore.booksTotalPages;
        let buttons = [];
        buttons.push(`<button class="page-btn" ${cur<=1?'disabled':''} data-page="${cur-1}"><i class="fa-solid fa-chevron-left"></i></button>`);
        const range = [];
        range.push(1);
        if (cur - 2 > 2) range.push('...');
        for (let i = Math.max(2, cur - 2); i <= Math.min(total - 1, cur + 2); i++) {
            range.push(i);
        }
        if (cur + 2 < total - 1) range.push('...');
        if (total > 1) range.push(total);
        range.forEach(p => {
            if (p === '...') buttons.push(`<span class="page-info">...</span>`);
            else buttons.push(`<button class="page-btn ${p===cur?'active':''}" data-page="${p}">${p}</button>`);
        });
        buttons.push(`<button class="page-btn" ${cur>=total?'disabled':''} data-page="${cur+1}"><i class="fa-solid fa-chevron-right"></i></button>`);
        container.innerHTML = `<div class="pagination">
            ${buttons.join('')}
            <span class="page-info">共 ${DataStore.booksTotal} 本 · 第 ${cur}/${total} 页</span>
        </div>`;
        container.querySelectorAll('.page-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (!isNaN(p) && p !== DataStore.booksPage && p >= 1 && p <= DataStore.booksTotalPages) {
                    DataStore.booksPage = p;
                    this.loadBooks();
                    document.getElementById('mainContent').scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });
    },

    /* ---- 图书详情弹窗 ---- */
    async showBookDetail(id) {
        Modal.show({
            title: '<i class="fa-solid fa-book-open"></i> 图书详情',
            size: 'lg',
            bodyHTML: '<div class="inline-loading"><i class="fa-solid fa-spinner"></i>加载中...</div>',
        });
        try {
            const book = await API.books.get(id);
            const cover = book.cover
                ? `<img src="${API.books.coverUrl(book.id)}" alt="${Utils.escape(book.title)}" onerror="this.style.display='none';this.parentNode.querySelector('.book-cover-default').style.display='flex';">
                   <div class="book-cover-default" style="display:none;"><i class="fa-solid fa-book"></i></div>`
                : `<div class="book-cover-default"><i class="fa-solid fa-book"></i></div>`;
            const categories = (book.categories || []).map(c => `<span class="badge badge-primary">${Utils.escape(c.name)}</span>`).join(' ') || '<span class="badge badge-primary">未分类</span>';
            const bodyHTML = `
                <div class="book-detail">
                    <div class="book-detail-cover">${cover}</div>
                    <div class="book-detail-info">
                        <h3>${Utils.escape(book.title)}</h3>
                        <div class="book-detail-author"><i class="fa-solid fa-user-pen"></i> ${Utils.escape(book.author || '未知作者')}</div>
                        <div class="book-detail-meta">
                            <div class="meta-item">
                                <span class="meta-label">格式</span>
                                <span class="meta-value"><span class="book-format-tag format-${book.format||'txt'}">${(book.format||'TXT').toUpperCase()}</span></span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">ISBN</span>
                                <span class="meta-value">${Utils.escape(book.isbn || '—')}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">出版社</span>
                                <span class="meta-value">${Utils.escape(book.publisher || '—')}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">页数</span>
                                <span class="meta-value">${book.pages || '—'}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">文件大小</span>
                                <span class="meta-value">${Utils.formatSize(book.size)}</span>
                            </div>
                            <div class="meta-item">
                                <span class="meta-label">语言</span>
                                <span class="meta-value">${Utils.escape(book.language || '—')}</span>
                            </div>
                        </div>
                        <div style="margin-top: var(--space-sm);">${categories}</div>
                        ${book.description ? `<div class="book-detail-desc">${Utils.escape(book.description).replace(/\n/g, '<br>')}</div>` : ''}
                        <div class="book-detail-actions">
                            <a href="${API.books.downloadUrl(book.id)}" class="btn btn-primary" download>
                                <i class="fa-solid fa-download"></i> 下载
                            </a>
                            <button class="btn btn-secondary" id="editBookBtn">
                                <i class="fa-solid fa-pen"></i> 编辑
                            </button>
                            <button class="btn btn-danger" id="deleteBookBtn">
                                <i class="fa-solid fa-trash"></i> 删除
                            </button>
                        </div>
                    </div>
                </div>
            `;
            // 更新弹窗内容
            document.getElementById('modalBody').innerHTML = bodyHTML;
            document.getElementById('editBookBtn').addEventListener('click', () => this.showEditModal(book));
            document.getElementById('deleteBookBtn').addEventListener('click', () => this.confirmDelete(book));
        } catch (err) {
            document.getElementById('modalBody').innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>加载详情失败</h3>
                <p>${Utils.escape(err.message)}</p>
            </div>`;
        }
    },

    /* ---- 删除图书确认 ---- */
    confirmDelete(book) {
        Modal.confirm(`确定删除《${book.title}》吗？此操作不可恢复，相关阅读进度和笔记也会被删除。`, '删除图书', async () => {
            try {
                Loading.show('正在删除...');
                await API.books.delete(book.id);
                Toast.success('删除成功');
                Modal.close();
                this.loadBooks();
                App.loadSidebarInfo();
            } catch (err) {
                Toast.error(err.message);
            } finally {
                Loading.hide();
            }
        }, '删除', true);
    },

    /* ---- 上传图书弹窗 ---- */
    showUploadModal() {
        const bodyHTML = `
            <form id="uploadForm">
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-file"></i> 选择图书文件</label>
                    <div class="form-file">
                        <div class="form-file-drop" id="fileDropArea">
                            <i class="fa-solid fa-cloud-arrow-up"></i>
                            <p id="fileDropText">点击选择或拖拽文件到此处</p>
                            <p class="file-name" id="fileDropName" style="display:none;"></p>
                        </div>
                        <input type="file" id="bookFile" accept=".pdf,.epub,.mobi,.azw3,.txt" style="display:none;">
                    </div>
                    <div class="form-hint">支持 PDF / EPUB / MOBI / AZW3 / TXT，最大 500MB</div>
                </div>
                <div class="upload-progress" id="uploadProgressWrap" style="display:none;">
                    <div class="upload-progress-bar" id="uploadProgressBar"></div>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-book"></i> 书名 <span style="color:var(--color-danger)">*</span></label>
                    <input type="text" id="uploadTitle" class="form-input" placeholder="如不填将使用文件名">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-user-pen"></i> 作者</label>
                        <input type="text" id="uploadAuthor" class="form-input" placeholder="作者">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-barcode"></i> ISBN</label>
                        <input type="text" id="uploadIsbn" class="form-input" placeholder="ISBN">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-building"></i> 出版社</label>
                        <input type="text" id="uploadPublisher" class="form-input" placeholder="出版社">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-file-lines"></i> 页数</label>
                        <input type="number" id="uploadPages" class="form-input" placeholder="页数" min="1">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-align-left"></i> 简介</label>
                    <textarea id="uploadDescription" class="form-textarea" placeholder="图书简介..."></textarea>
                </div>
            </form>
        `;
        Modal.show({
            title: '<i class="fa-solid fa-cloud-arrow-up"></i> 上传图书',
            size: 'lg',
            bodyHTML,
            footerHTML: `
                <button class="btn btn-ghost" id="uploadCancelBtn">取消</button>
                <button class="btn btn-primary" id="uploadSubmitBtn"><i class="fa-solid fa-check"></i> 开始上传</button>
            `,
            onMount: (body) => {
                const fileInput = body.querySelector('#bookFile');
                const dropArea = body.querySelector('#fileDropArea');
                const fileName = body.querySelector('#fileDropName');
                const fileText = body.querySelector('#fileDropText');

                dropArea.addEventListener('click', () => fileInput.click());
                dropArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropArea.classList.add('dragover');
                });
                dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
                dropArea.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropArea.classList.remove('dragover');
                    if (e.dataTransfer.files.length) {
                        fileInput.files = e.dataTransfer.files;
                        const f = e.dataTransfer.files[0];
                        fileName.textContent = `${f.name} (${Utils.formatSize(f.size)})`;
                        fileName.style.display = 'block';
                        fileText.style.display = 'none';
                    }
                });
                fileInput.addEventListener('change', () => {
                    if (fileInput.files.length) {
                        const f = fileInput.files[0];
                        fileName.textContent = `${f.name} (${Utils.formatSize(f.size)})`;
                        fileName.style.display = 'block';
                        fileText.style.display = 'none';
                        // 自动填充书名
                        if (!body.querySelector('#uploadTitle').value) {
                            const titleGuess = f.name.replace(/\.[^.]+$/, '');
                            body.querySelector('#uploadTitle').value = titleGuess;
                        }
                    }
                });

                body.querySelector('#uploadCancelBtn').addEventListener('click', () => Modal.close());
                body.querySelector('#uploadSubmitBtn').addEventListener('click', () => this.handleUpload(body));
            }
        });
    },

    /* ---- 处理上传 ---- */
    async handleUpload(body) {
        const fileInput = body.querySelector('#bookFile');
        if (!fileInput.files.length) {
            Toast.warning('请选择图书文件');
            return;
        }
        const file = fileInput.files[0];
        const ext = Utils.getExtension(file.name);
        const allowed = ['pdf', 'epub', 'mobi', 'azw3', 'txt'];
        if (!allowed.includes(ext)) {
            Toast.error('不支持的文件格式，仅支持 ' + allowed.join(' / '));
            return;
        }
        const title = body.querySelector('#uploadTitle').value.trim();
        if (!title) {
            Toast.warning('请输入书名');
            return;
        }
        const author = body.querySelector('#uploadAuthor').value.trim();
        const isbn = body.querySelector('#uploadIsbn').value.trim();
        const publisher = body.querySelector('#uploadPublisher').value.trim();
        const pages = body.querySelector('#uploadPages').value;
        const description = body.querySelector('#uploadDescription').value.trim();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('format', ext);
        if (author) formData.append('author', author);
        if (isbn) formData.append('isbn', isbn);
        if (publisher) formData.append('publisher', publisher);
        if (pages) formData.append('pages', pages);
        if (description) formData.append('description', description);

        const progressWrap = body.querySelector('#uploadProgressWrap');
        const progressBar = body.querySelector('#uploadProgressBar');
        const submitBtn = body.querySelector('#uploadSubmitBtn');
        progressWrap.style.display = 'block';
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner"></i> 上传中...';

        try {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/books');
            xhr.setRequestHeader('Authorization', 'Bearer ' + DataStore.token);
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total * 100);
                    progressBar.style.width = percent + '%';
                }
            });
            xhr.addEventListener('load', () => {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> 开始上传';
                if (xhr.status >= 200 && xhr.status < 300) {
                    Toast.success('上传成功');
                    Modal.close();
                    DataStore.booksPage = 1;
                    this.loadBooks();
                    App.loadSidebarInfo();
                } else {
                    let msg = '上传失败 (' + xhr.status + ')';
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (data.detail || data.message) msg = data.detail || data.message;
                    } catch (e) {}
                    Toast.error(msg);
                }
            });
            xhr.addEventListener('error', () => {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> 开始上传';
                Toast.error('网络错误，上传失败');
            });
            xhr.send(formData);
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> 开始上传';
            Toast.error(err.message);
        }
    },

    /* ---- 编辑图书弹窗 ---- */
    showEditModal(book) {
        const bodyHTML = `
            <form id="editForm">
                <div class="form-group">
                    <label class="form-label">书名 <span style="color:var(--color-danger)">*</span></label>
                    <input type="text" id="editTitle" class="form-input" value="${Utils.escape(book.title)}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">作者</label>
                        <input type="text" id="editAuthor" class="form-input" value="${Utils.escape(book.author || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">ISBN</label>
                        <input type="text" id="editIsbn" class="form-input" value="${Utils.escape(book.isbn || '')}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">出版社</label>
                        <input type="text" id="editPublisher" class="form-input" value="${Utils.escape(book.publisher || '')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">页数</label>
                        <input type="number" id="editPages" class="form-input" value="${book.pages || ''}" min="1">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">语言</label>
                    <input type="text" id="editLanguage" class="form-input" value="${Utils.escape(book.language || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">简介</label>
                    <textarea id="editDescription" class="form-textarea">${Utils.escape(book.description || '')}</textarea>
                </div>
            </form>
        `;
        Modal.show({
            title: '<i class="fa-solid fa-pen"></i> 编辑图书',
            bodyHTML,
            footerHTML: `
                <button class="btn btn-ghost" id="editCancelBtn">取消</button>
                <button class="btn btn-primary" id="editSaveBtn"><i class="fa-solid fa-check"></i> 保存</button>
            `,
            onMount: (body) => {
                body.querySelector('#editCancelBtn').addEventListener('click', () => Modal.close());
                body.querySelector('#editSaveBtn').addEventListener('click', async () => {
                    const data = {
                        title: body.querySelector('#editTitle').value.trim(),
                        author: body.querySelector('#editAuthor').value.trim() || null,
                        isbn: body.querySelector('#editIsbn').value.trim() || null,
                        publisher: body.querySelector('#editPublisher').value.trim() || null,
                        pages: body.querySelector('#editPages').value ? parseInt(body.querySelector('#editPages').value) : null,
                        language: body.querySelector('#editLanguage').value.trim() || null,
                        description: body.querySelector('#editDescription').value.trim() || null,
                    };
                    if (!data.title) { Toast.warning('书名不能为空'); return; }
                    try {
                        Loading.show('保存中...');
                        await API.books.update(book.id, data);
                        Toast.success('保存成功');
                        Modal.close();
                        this.showBookDetail(book.id);
                        this.loadBooks();
                    } catch (err) {
                        Toast.error(err.message);
                    } finally {
                        Loading.hide();
                    }
                });
            }
        });
    },
};


/* ============================================================
   8.2 阅读进度页面
   ============================================================ */
Pages.progress = {
    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h1 class="page-title"><i class="fa-solid fa-chart-line"></i> 阅读进度</h1>
                    <p class="page-subtitle">追踪每本书的阅读足迹</p>
                </div>
            </div>
            <div id="progressContainer">
                <div class="inline-loading"><i class="fa-solid fa-spinner"></i>正在加载进度...</div>
            </div>
        `;
        this.loadProgress();
    },

    async loadProgress() {
        const container = document.getElementById('progressContainer');
        if (!container) return;
        container.innerHTML = '<div class="inline-loading"><i class="fa-solid fa-spinner"></i>正在加载进度...</div>';
        try {
            const data = await API.progress.list();
            DataStore.progressList = Array.isArray(data) ? data : (data.items || []);
            this.renderProgress();
        } catch (err) {
            container.innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>加载失败</h3>
                <p>${Utils.escape(err.message)}</p>
            </div>`;
        }
    },

    renderProgress() {
        const container = document.getElementById('progressContainer');
        if (!container) return;
        if (!DataStore.progressList.length) {
            container.innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-book-open-reader"></i>
                <h3>暂无阅读记录</h3>
                <p>开始阅读图书后，进度会显示在这里</p>
            </div>`;
            return;
        }

        // 按最后阅读时间排序
        const sorted = [...DataStore.progressList].sort((a, b) => {
            const ta = a.last_read_at ? new Date(a.last_read_at).getTime() : 0;
            const tb = b.last_read_at ? new Date(b.last_read_at).getTime() : 0;
            return tb - ta;
        });
        const recent = sorted.slice(0, 3);
        const rest = sorted.slice(3);

        let html = '';

        // 最近阅读卡片
        if (recent.length) {
            html += '<div class="recent-section">';
            html += '<h2 style="font-family:var(--font-serif);color:var(--color-primary);margin-bottom:var(--space-md);font-size:18px;"><i class="fa-solid fa-fire"></i> 最近阅读</h2>';
            html += '<div class="recent-cards">';
            recent.forEach(p => {
                const pct = (p.progress || 0).toFixed(1);
                html += `
                    <div class="recent-card" data-book-id="${p.book_id}">
                        <div class="recent-card-header">
                            <i class="fa-solid fa-clock"></i>
                            <span>${Utils.formatDateTime(p.last_read_at)}</span>
                        </div>
                        <div class="recent-card-title">${Utils.escape(p.book ? p.book.title : '已删除的图书')}</div>
                        <div class="recent-card-meta">
                            <span>当前页 ${p.current_page || 0}${p.book && p.book.pages ? ' / ' + p.book.pages : ''}</span>
                            <span>${pct}%</span>
                        </div>
                        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                        <div class="recent-card-meta">
                            <span><i class="fa-solid fa-stopwatch"></i> ${Utils.formatReadTime(p.total_read_time)}</span>
                            <span>第 ${p.current_chapter || 0} 章</span>
                        </div>
                    </div>
                `;
            });
            html += '</div></div>';
        }

        // 全部进度列表
        if (sorted.length) {
            html += '<h2 style="font-family:var(--font-serif);color:var(--color-primary);margin:var(--space-xl) 0 var(--space-md);font-size:18px;"><i class="fa-solid fa-list-check"></i> 全部进度</h2>';
            html += '<div>';
            sorted.forEach(p => {
                const pct = (p.progress || 0);
                const pctStr = pct.toFixed(1);
                const cls = Utils.progressClass(pct);
                html += `
                    <div class="list-item" data-id="${p.book_id}">
                        <div class="list-item-content">
                            <div class="list-item-title">
                                <i class="fa-solid fa-book" style="color:var(--color-primary-light);"></i>
                                ${Utils.escape(p.book ? p.book.title : '已删除的图书')}
                                ${pct >= 100 ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> 已读完</span>' : ''}
                            </div>
                            <div class="list-item-meta">
                                <span><i class="fa-solid fa-file-lines"></i> 当前第 ${p.current_page || 0} 页${p.book && p.book.pages ? ' / ' + p.book.pages : ''}</span>
                                <span><i class="fa-solid fa-clock"></i> ${Utils.formatDateTime(p.last_read_at)}</span>
                                <span><i class="fa-solid fa-stopwatch"></i> ${Utils.formatReadTime(p.total_read_time)}</span>
                            </div>
                            <div class="progress-bar" style="margin-top:8px;">
                                <div class="progress-fill ${cls}" style="width:${pctStr}%"></div>
                            </div>
                            <div class="progress-text">进度 ${pctStr}% · 第 ${p.current_chapter || 0} 章</div>
                        </div>
                        <div class="list-item-actions">
                            <button class="icon-btn edit-progress" title="更新进度"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button class="icon-btn delete-progress" title="删除进度"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        container.innerHTML = html;

        // 绑定事件
        container.querySelectorAll('.recent-card').forEach(card => {
            card.addEventListener('click', () => {
                const bookId = parseInt(card.dataset.bookId);
                this.showUpdateModal(bookId);
            });
        });
        container.querySelectorAll('.edit-progress').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.closest('.list-item').dataset.id);
                this.showUpdateModal(id);
            });
        });
        container.querySelectorAll('.delete-progress').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.closest('.list-item').dataset.id);
                const item = DataStore.progressList.find(p => p.book_id === id);
                Modal.confirm(`确定删除《${item && item.book ? item.book.title : '该书'}》的阅读进度吗？`, '删除进度', async () => {
                    try {
                        Loading.show('删除中...');
                        await API.progress.delete(id);
                        Toast.success('删除成功');
                        this.loadProgress();
                    } catch (err) {
                        Toast.error(err.message);
                    } finally {
                        Loading.hide();
                    }
                }, '删除', true);
            });
        });
    },

    /* ---- 更新进度弹窗 ---- */
    async showUpdateModal(bookId) {
        const item = DataStore.progressList.find(p => p.book_id === bookId) || {};
        const book = item.book || {};
        Modal.show({
            title: '<i class="fa-solid fa-chart-line"></i> 更新阅读进度',
            bodyHTML: '<div class="inline-loading"><i class="fa-solid fa-spinner"></i>加载中...</div>',
            footerHTML: `
                <button class="btn btn-ghost" id="progressCancelBtn">取消</button>
                <button class="btn btn-primary" id="progressSaveBtn"><i class="fa-solid fa-check"></i> 保存</button>
            `,
            onMount: async (body) => {
                try {
                    let progress = item;
                    if (!progress || !progress.book_id) {
                        progress = await API.progress.get(bookId);
                    }
                    const b = progress.book || book;
                    body.querySelector('#modalBody').innerHTML = `
                        <form id="progressForm">
                            <div style="background:var(--color-bg);padding:var(--space-md);border-radius:var(--radius-md);margin-bottom:var(--space-md);">
                                <div style="font-family:var(--font-serif);color:var(--color-primary);font-weight:700;font-size:16px;">
                                    <i class="fa-solid fa-book"></i> ${Utils.escape(b.title || '未知图书')}
                                </div>
                                <div style="font-size:12px;color:var(--color-text-secondary);margin-top:4px;">
                                    ${Utils.escape(b.author || '未知作者')}
                                    ${b.pages ? ' · 共 ' + b.pages + ' 页' : ''}
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">当前页码</label>
                                    <input type="number" id="progCurrentPage" class="form-input" value="${progress.current_page || 0}" min="0" ${b.pages?'max="'+b.pages+'"':''}>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">当前章节</label>
                                    <input type="number" id="progCurrentChapter" class="form-input" value="${progress.current_chapter || 0}" min="0">
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">阅读进度 (0-100)</label>
                                <input type="number" id="progPercent" class="form-input" value="${(progress.progress || 0).toFixed(1)}" min="0" max="100" step="0.1">
                                <div class="form-hint">或拖动滑块快速设置</div>
                                <input type="range" id="progSlider" min="0" max="100" step="0.1" value="${progress.progress || 0}" style="width:100%;margin-top:8px;">
                            </div>
                            <div class="form-group">
                                <label class="form-label">累计阅读时长（秒）</label>
                                <input type="number" id="progReadTime" class="form-input" value="${progress.total_read_time || 0}" min="0">
                                <div class="form-hint">${Utils.formatReadTime(progress.total_read_time || 0)}</div>
                            </div>
                        </form>
                    `;
                    const slider = body.querySelector('#progSlider');
                    const percent = body.querySelector('#progPercent');
                    slider.addEventListener('input', () => { percent.value = slider.value; });
                    percent.addEventListener('input', () => {
                        const v = parseFloat(percent.value);
                        if (!isNaN(v)) slider.value = v;
                    });

                    body.querySelector('#progressCancelBtn').addEventListener('click', () => Modal.close());
                    body.querySelector('#progressSaveBtn').addEventListener('click', async () => {
                        const data = {
                            current_page: parseInt(body.querySelector('#progCurrentPage').value) || 0,
                            current_chapter: parseInt(body.querySelector('#progCurrentChapter').value) || 0,
                            progress: Math.max(0, Math.min(100, parseFloat(body.querySelector('#progPercent').value) || 0)),
                            total_read_time: parseInt(body.querySelector('#progReadTime').value) || 0,
                        };
                        try {
                            Loading.show('保存中...');
                            await API.progress.update(bookId, data);
                            Toast.success('进度已更新');
                            Modal.close();
                            this.loadProgress();
                        } catch (err) {
                            Toast.error(err.message);
                        } finally {
                            Loading.hide();
                        }
                    });
                } catch (err) {
                    body.querySelector('#modalBody').innerHTML = `<div class="empty-state">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <h3>加载失败</h3>
                        <p>${Utils.escape(err.message)}</p>
                    </div>`;
                }
            }
        });
    },
};


/* ============================================================
   8.3 笔记管理页面
   ============================================================ */
Pages.notes = {
    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h1 class="page-title"><i class="fa-solid fa-pen-to-square"></i> 笔记管理</h1>
                    <p class="page-subtitle">记录阅读中的思考与感悟</p>
                </div>
                <button class="btn btn-primary" id="createNoteBtn">
                    <i class="fa-solid fa-plus"></i> 新建笔记
                </button>
            </div>
            <div id="notesContainer">
                <div class="inline-loading"><i class="fa-solid fa-spinner"></i>正在加载笔记...</div>
            </div>
        `;
        document.getElementById('createNoteBtn').addEventListener('click', () => this.showCreateModal());
        this.loadNotes();
    },

    async loadNotes() {
        const container = document.getElementById('notesContainer');
        if (!container) return;
        container.innerHTML = '<div class="inline-loading"><i class="fa-solid fa-spinner"></i>正在加载笔记...</div>';
        try {
            const data = await API.notes.list();
            DataStore.notesList = Array.isArray(data) ? data : (data.items || []);
            this.renderNotes();
        } catch (err) {
            container.innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>加载失败</h3>
                <p>${Utils.escape(err.message)}</p>
            </div>`;
        }
    },

    renderNotes() {
        const container = document.getElementById('notesContainer');
        if (!container) return;
        if (!DataStore.notesList.length) {
            container.innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-feather-pointed"></i>
                <h3>暂无笔记</h3>
                <p>阅读时记下您的所思所想</p>
            </div>`;
            return;
        }

        // 按图书分组
        const groups = {};
        DataStore.notesList.forEach(note => {
            const bookId = note.book_id;
            if (!groups[bookId]) {
                groups[bookId] = {
                    book: note.book || { title: '已删除的图书' },
                    notes: [],
                };
            }
            groups[bookId].notes.push(note);
        });

        // 排序：按最新笔记时间倒序
        const groupList = Object.values(groups).sort((a, b) => {
            const ta = Math.max(...a.notes.map(n => new Date(n.updated_at || n.created_at).getTime() || 0));
            const tb = Math.max(...b.notes.map(n => new Date(n.updated_at || n.created_at).getTime() || 0));
            return tb - ta;
        });

        let html = '';
        groupList.forEach(group => {
            html += `
                <div class="note-group-header">
                    <i class="fa-solid fa-book"></i>
                    <span class="note-group-title">${Utils.escape(group.book.title)}</span>
                    <span class="note-group-count">${group.notes.length} 条笔记</span>
                </div>
            `;
            group.notes.sort((a, b) => {
                const ta = new Date(b.updated_at || b.created_at).getTime() || 0;
                const tA = new Date(a.updated_at || a.created_at).getTime() || 0;
                return ta - tA;
            }).forEach(note => {
                let content = Utils.escape(note.content);
                if (note.highlight) {
                    const hl = Utils.escape(note.highlight);
                    content = content.replace(new RegExp(hl, 'g'), `<span class="note-highlight">${hl}</span>`);
                }
                html += `
                    <div class="note-item" data-id="${note.id}">
                        <div class="note-content">${content}</div>
                        <div class="note-meta">
                            <div class="note-meta-left">
                                ${note.chapter ? `<span><i class="fa-solid fa-bookmark"></i> ${Utils.escape(note.chapter)}</span>` : ''}
                                ${note.page_number ? `<span><i class="fa-solid fa-file-lines"></i> 第 ${note.page_number} 页</span>` : ''}
                                <span><i class="fa-solid fa-clock"></i> ${Utils.formatDateTime(note.updated_at || note.created_at)}</span>
                            </div>
                            <div class="list-item-actions">
                                <button class="icon-btn edit-note" title="编辑"><i class="fa-solid fa-pen"></i></button>
                                <button class="icon-btn delete-note" title="删除"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    </div>
                `;
            });
        });

        container.innerHTML = html;
        container.querySelectorAll('.edit-note').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.closest('.note-item').dataset.id);
                this.showEditModal(id);
            });
        });
        container.querySelectorAll('.delete-note').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.closest('.note-item').dataset.id);
                const note = DataStore.notesList.find(n => n.id === id);
                Modal.confirm(`确定删除这条笔记吗？`, '删除笔记', async () => {
                    try {
                        Loading.show('删除中...');
                        await API.notes.delete(id);
                        Toast.success('删除成功');
                        this.loadNotes();
                    } catch (err) {
                        Toast.error(err.message);
                    } finally {
                        Loading.hide();
                    }
                }, '删除', true);
            });
        });
    },

    /* ---- 新建笔记弹窗 ---- */
    async showCreateModal() {
        // 先加载图书列表
        let books = [];
        try {
            const data = await API.books.list({ page: 1, page_size: 200 });
            books = data.items || [];
        } catch (err) {
            Toast.error('加载图书列表失败');
            return;
        }
        if (!books.length) {
            Toast.warning('请先上传至少一本图书');
            return;
        }
        const bodyHTML = `
            <form id="noteForm">
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-book"></i> 选择图书 <span style="color:var(--color-danger)">*</span></label>
                    <select id="noteBookId" class="form-select">
                        ${books.map(b => `<option value="${b.id}">${Utils.escape(b.title)} - ${Utils.escape(b.author||'未知')}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-align-left"></i> 笔记内容 <span style="color:var(--color-danger)">*</span></label>
                    <textarea id="noteContent" class="form-textarea" placeholder="记下你的想法..." required></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-file-lines"></i> 页码</label>
                        <input type="number" id="notePage" class="form-input" min="1" placeholder="页码">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-bookmark"></i> 章节</label>
                        <input type="text" id="noteChapter" class="form-input" placeholder="章节名">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-highlighter"></i> 高亮文本</label>
                    <input type="text" id="noteHighlight" class="form-input" placeholder="原文中要高亮的文字（可选）">
                    <div class="form-hint">输入的内容若出现在笔记中，会被标记为高亮</div>
                </div>
            </form>
        `;
        Modal.show({
            title: '<i class="fa-solid fa-feather"></i> 新建笔记',
            bodyHTML,
            footerHTML: `
                <button class="btn btn-ghost" id="noteCancelBtn">取消</button>
                <button class="btn btn-primary" id="noteSaveBtn"><i class="fa-solid fa-check"></i> 保存</button>
            `,
            onMount: (body) => {
                body.querySelector('#noteCancelBtn').addEventListener('click', () => Modal.close());
                body.querySelector('#noteSaveBtn').addEventListener('click', async () => {
                    const data = {
                        book_id: parseInt(body.querySelector('#noteBookId').value),
                        content: body.querySelector('#noteContent').value.trim(),
                        page_number: body.querySelector('#notePage').value ? parseInt(body.querySelector('#notePage').value) : null,
                        chapter: body.querySelector('#noteChapter').value.trim() || null,
                        highlight: body.querySelector('#noteHighlight').value.trim() || null,
                    };
                    if (!data.content) { Toast.warning('请输入笔记内容'); return; }
                    if (!data.book_id) { Toast.warning('请选择图书'); return; }
                    try {
                        Loading.show('保存中...');
                        await API.notes.create(data);
                        Toast.success('笔记已保存');
                        Modal.close();
                        this.loadNotes();
                    } catch (err) {
                        Toast.error(err.message);
                    } finally {
                        Loading.hide();
                    }
                });
            }
        });
    },

    /* ---- 编辑笔记弹窗 ---- */
    showEditModal(id) {
        const note = DataStore.notesList.find(n => n.id === id);
        if (!note) { Toast.error('笔记不存在'); return; }
        const bodyHTML = `
            <form id="noteEditForm">
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-book"></i> 图书</label>
                    <input type="text" class="form-input" value="${Utils.escape(note.book ? note.book.title : '已删除')}" disabled>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-align-left"></i> 笔记内容 <span style="color:var(--color-danger)">*</span></label>
                    <textarea id="noteContent" class="form-textarea" required>${Utils.escape(note.content)}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-file-lines"></i> 页码</label>
                        <input type="number" id="notePage" class="form-input" min="1" value="${note.page_number || ''}">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-bookmark"></i> 章节</label>
                        <input type="text" id="noteChapter" class="form-input" value="${Utils.escape(note.chapter || '')}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-highlighter"></i> 高亮文本</label>
                    <input type="text" id="noteHighlight" class="form-input" value="${Utils.escape(note.highlight || '')}">
                </div>
            </form>
        `;
        Modal.show({
            title: '<i class="fa-solid fa-pen"></i> 编辑笔记',
            bodyHTML,
            footerHTML: `
                <button class="btn btn-ghost" id="noteCancelBtn">取消</button>
                <button class="btn btn-primary" id="noteSaveBtn"><i class="fa-solid fa-check"></i> 保存</button>
            `,
            onMount: (body) => {
                body.querySelector('#noteCancelBtn').addEventListener('click', () => Modal.close());
                body.querySelector('#noteSaveBtn').addEventListener('click', async () => {
                    const data = {
                        content: body.querySelector('#noteContent').value.trim(),
                        page_number: body.querySelector('#notePage').value ? parseInt(body.querySelector('#notePage').value) : null,
                        chapter: body.querySelector('#noteChapter').value.trim() || null,
                        highlight: body.querySelector('#noteHighlight').value.trim() || null,
                    };
                    if (!data.content) { Toast.warning('请输入笔记内容'); return; }
                    try {
                        Loading.show('保存中...');
                        await API.notes.update(id, data);
                        Toast.success('笔记已更新');
                        Modal.close();
                        this.loadNotes();
                    } catch (err) {
                        Toast.error(err.message);
                    } finally {
                        Loading.hide();
                    }
                });
            }
        });
    },
};


/* ============================================================
   8.4 分类管理页面
   ============================================================ */
Pages.categories = {
    async render(container) {
        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h1 class="page-title"><i class="fa-solid fa-folder-tree"></i> 分类管理</h1>
                    <p class="page-subtitle">整理家庭书库的分类结构</p>
                </div>
                <button class="btn btn-primary" id="addRootCategoryBtn">
                    <i class="fa-solid fa-plus"></i> 添加分类
                </button>
            </div>
            <div id="categoryTreeContainer">
                <div class="inline-loading"><i class="fa-solid fa-spinner"></i>正在加载分类...</div>
            </div>
        `;
        document.getElementById('addRootCategoryBtn').addEventListener('click', () => this.showCreateModal(null));
        this.loadTree();
    },

    async loadTree() {
        const container = document.getElementById('categoryTreeContainer');
        if (!container) return;
        container.innerHTML = '<div class="inline-loading"><i class="fa-solid fa-spinner"></i>正在加载分类...</div>';
        try {
            const tree = await API.categories.tree();
            DataStore.categoryTree = tree || [];
            this.renderTree();
        } catch (err) {
            container.innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <h3>加载失败</h3>
                <p>${Utils.escape(err.message)}</p>
            </div>`;
        }
    },

    renderTree() {
        const container = document.getElementById('categoryTreeContainer');
        if (!container) return;
        if (!DataStore.categoryTree.length) {
            container.innerHTML = `<div class="empty-state">
                <i class="fa-solid fa-folder-open"></i>
                <h3>暂无分类</h3>
                <p>点击右上角"添加分类"创建第一个分类</p>
            </div>`;
            return;
        }
        const renderNode = (node, depth = 0) => {
            const hasChildren = node.children && node.children.length;
            return `
                <div class="tree-node" data-id="${node.id}">
                    <div class="tree-item">
                        <span class="tree-toggle ${hasChildren ? '' : 'invisible'}" data-toggle="${node.id}">
                            <i class="fa-solid fa-chevron-down"></i>
                        </span>
                        <i class="fa-solid ${node.icon || 'fa-folder'} tree-icon"></i>
                        <span class="tree-name">${Utils.escape(node.name)}</span>
                        <span class="tree-count">${hasChildren ? node.children.length + ' 子类' : ''}</span>
                        <div class="tree-actions">
                            <button class="icon-btn add-sub" data-id="${node.id}" title="添加子分类"><i class="fa-solid fa-plus"></i></button>
                            <button class="icon-btn edit-cat" data-id="${node.id}" title="编辑"><i class="fa-solid fa-pen"></i></button>
                            <button class="icon-btn delete-cat" data-id="${node.id}" title="删除"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    ${hasChildren ? `<div class="tree-node-children" id="children-${node.id}">
                        ${node.children.map(c => renderNode(c, depth + 1)).join('')}
                    </div>` : ''}
                </div>
            `;
        };
        container.innerHTML = `<div class="category-tree">${DataStore.categoryTree.map(n => renderNode(n)).join('')}</div>`;

        // 绑定事件
        container.querySelectorAll('.tree-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = toggle.dataset.toggle;
                const childrenEl = document.getElementById('children-' + id);
                if (childrenEl) {
                    childrenEl.style.display = childrenEl.style.display === 'none' ? 'block' : 'none';
                    toggle.classList.toggle('collapsed');
                }
            });
        });
        container.querySelectorAll('.add-sub').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showCreateModal(parseInt(btn.dataset.id));
            });
        });
        container.querySelectorAll('.edit-cat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showEditModal(parseInt(btn.dataset.id));
            });
        });
        container.querySelectorAll('.delete-cat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmDelete(parseInt(btn.dataset.id));
            });
        });
    },

    /* ---- 查找节点（递归） ---- */
    findNode(id, nodes = DataStore.categoryTree) {
        for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children && n.children.length) {
                const found = this.findNode(id, n.children);
                if (found) return found;
            }
        }
        return null;
    },

    /* ---- 创建分类弹窗 ---- */
    showCreateModal(parentId) {
        const parent = parentId ? this.findNode(parentId) : null;
        const bodyHTML = `
            <form id="catForm">
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-tag"></i> 分类名称 <span style="color:var(--color-danger)">*</span></label>
                    <input type="text" id="catName" class="form-input" placeholder="如：小说、技术、儿童读物" required>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-sitemap"></i> 父分类</label>
                    <input type="text" class="form-input" value="${parent ? Utils.escape(parent.name) : '（顶级分类）'}" disabled>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-icons"></i> 图标</label>
                    <select id="catIcon" class="form-select">
                        <option value="fa-folder">文件夹</option>
                        <option value="fa-book">图书</option>
                        <option value="fa-book-open">打开的书</option>
                        <option value="fa-feather">羽毛笔</option>
                        <option value="fa-graduation-cap">学习</option>
                        <option value="fa-lightbulb">灵感</option>
                        <option value="fa-heart">喜爱</option>
                        <option value="fa-star">星标</option>
                        <option value="fa-rocket">科幻</option>
                        <option value="fa-landmark">历史</option>
                        <option value="fa-flask">科技</option>
                        <option value="fa-user-tie">传记</option>
                    </select>
                    <div class="form-hint">在前端列表中显示的图标</div>
                </div>
            </form>
        `;
        Modal.show({
            title: `<i class="fa-solid fa-folder-plus"></i> ${parent ? '在《' + Utils.escape(parent.name) + '》下添加子分类' : '添加顶级分类'}`,
            bodyHTML,
            footerHTML: `
                <button class="btn btn-ghost" id="catCancelBtn">取消</button>
                <button class="btn btn-primary" id="catSaveBtn"><i class="fa-solid fa-check"></i> 保存</button>
            `,
            onMount: (body) => {
                body.querySelector('#catCancelBtn').addEventListener('click', () => Modal.close());
                body.querySelector('#catSaveBtn').addEventListener('click', async () => {
                    const data = {
                        name: body.querySelector('#catName').value.trim(),
                        parent_id: parentId,
                        icon: body.querySelector('#catIcon').value,
                    };
                    if (!data.name) { Toast.warning('请输入分类名称'); return; }
                    try {
                        Loading.show('保存中...');
                        await API.categories.create(data);
                        Toast.success('分类已创建');
                        Modal.close();
                        this.loadTree();
                    } catch (err) {
                        Toast.error(err.message);
                    } finally {
                        Loading.hide();
                    }
                });
            }
        });
    },

    /* ---- 编辑分类弹窗 ---- */
    showEditModal(id) {
        const cat = this.findNode(id);
        if (!cat) { Toast.error('分类不存在'); return; }
        const bodyHTML = `
            <form id="catEditForm">
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-tag"></i> 分类名称 <span style="color:var(--color-danger)">*</span></label>
                    <input type="text" id="catName" class="form-input" value="${Utils.escape(cat.name)}" required>
                </div>
                <div class="form-group">
                    <label class="form-label"><i class="fa-solid fa-icons"></i> 图标</label>
                    <select id="catIcon" class="form-select">
                        ${['fa-folder','fa-book','fa-book-open','fa-feather','fa-graduation-cap','fa-lightbulb','fa-heart','fa-star','fa-rocket','fa-landmark','fa-flask','fa-user-tie'].map(ic => `<option value="${ic}" ${cat.icon===ic?'selected':''}>${ic.replace('fa-','').replace('-',' ')}</option>`).join('')}
                    </select>
                </div>
            </form>
        `;
        Modal.show({
            title: '<i class="fa-solid fa-pen"></i> 编辑分类',
            bodyHTML,
            footerHTML: `
                <button class="btn btn-ghost" id="catCancelBtn">取消</button>
                <button class="btn btn-primary" id="catSaveBtn"><i class="fa-solid fa-check"></i> 保存</button>
            `,
            onMount: (body) => {
                body.querySelector('#catCancelBtn').addEventListener('click', () => Modal.close());
                body.querySelector('#catSaveBtn').addEventListener('click', async () => {
                    const data = {
                        name: body.querySelector('#catName').value.trim(),
                        icon: body.querySelector('#catIcon').value,
                    };
                    if (!data.name) { Toast.warning('请输入分类名称'); return; }
                    try {
                        Loading.show('保存中...');
                        await API.categories.update(id, data);
                        Toast.success('分类已更新');
                        Modal.close();
                        this.loadTree();
                    } catch (err) {
                        Toast.error(err.message);
                    } finally {
                        Loading.hide();
                    }
                });
            }
        });
    },

    /* ---- 删除分类确认 ---- */
    confirmDelete(id) {
        const cat = this.findNode(id);
        if (!cat) return;
        Modal.confirm(`确定删除分类《${cat.name}》吗？子分类也会一并删除。`, '删除分类', async () => {
            try {
                Loading.show('删除中...');
                await API.categories.delete(id);
                Toast.success('分类已删除');
                this.loadTree();
            } catch (err) {
                Toast.error(err.message);
            } finally {
                Loading.hide();
            }
        }, '删除', true);
    },
};


/* ============================================================
   8.5 用户设置页面
   ============================================================ */
Pages.settings = {
    async render(container) {
        const user = DataStore.currentUser || {};
        container.innerHTML = `
            <div class="page-header">
                <div>
                    <h1 class="page-title"><i class="fa-solid fa-gear"></i> 用户设置</h1>
                    <p class="page-subtitle">管理个人账户信息</p>
                </div>
            </div>

            <div class="settings-section">
                <h3 class="settings-section-title"><i class="fa-solid fa-user"></i> 个人信息</h3>
                <form id="profileForm">
                    <div class="avatar-preview" id="avatarPreview">
                        ${user.avatar ? `<img src="${Utils.escape(user.avatar)}" onerror="this.parentNode.innerHTML='<i class=\\'fa-solid fa-user\\'></i>';">` : `<i class="fa-solid fa-user"></i>`}
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-image"></i> 头像 URL</label>
                        <input type="text" id="profileAvatar" class="form-input" value="${Utils.escape(user.avatar || '')}" placeholder="https://...">
                        <div class="form-hint">输入图片地址，留空使用默认头像</div>
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-signature"></i> 昵称</label>
                        <input type="text" id="profileNickname" class="form-input" value="${Utils.escape(user.nickname || '')}" placeholder="昵称">
                    </div>
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-user"></i> 用户名</label>
                        <input type="text" class="form-input" value="${Utils.escape(user.username || '')}" disabled>
                        <div class="form-hint">用户名不可修改</div>
                    </div>
                    <button type="button" class="btn btn-primary" id="profileSaveBtn">
                        <i class="fa-solid fa-check"></i> 保存修改
                    </button>
                </form>
            </div>

            <div class="settings-section">
                <h3 class="settings-section-title"><i class="fa-solid fa-key"></i> 修改密码</h3>
                <form id="passwordForm">
                    <div class="form-group">
                        <label class="form-label"><i class="fa-solid fa-lock"></i> 旧密码 <span style="color:var(--color-danger)">*</span></label>
                        <input type="password" id="oldPassword" class="form-input" autocomplete="current-password" required>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label"><i class="fa-solid fa-lock"></i> 新密码 <span style="color:var(--color-danger)">*</span></label>
                            <input type="password" id="newPassword" class="form-input" autocomplete="new-password" required minlength="6">
                        </div>
                        <div class="form-group">
                            <label class="form-label"><i class="fa-solid fa-lock"></i> 确认新密码 <span style="color:var(--color-danger)">*</span></label>
                            <input type="password" id="confirmPassword" class="form-input" autocomplete="new-password" required minlength="6">
                        </div>
                    </div>
                    <button type="button" class="btn btn-primary" id="passwordSaveBtn">
                        <i class="fa-solid fa-key"></i> 修改密码
                    </button>
                </form>
            </div>

            <div class="settings-section">
                <h3 class="settings-section-title"><i class="fa-solid fa-circle-info"></i> 账户信息</h3>
                <div class="book-detail-meta" style="margin:0;">
                    <div class="meta-item">
                        <span class="meta-label">用户 ID</span>
                        <span class="meta-value">${user.id || '—'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">账户状态</span>
                        <span class="meta-value">${user.is_active ? '<span class="badge badge-success">活跃</span>' : '<span class="badge badge-warning">禁用</span>'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">注册时间</span>
                        <span class="meta-value">${Utils.formatDateTime(user.created_at)}</span>
                    </div>
                </div>
            </div>
        `;

        // 头像预览
        document.getElementById('profileAvatar').addEventListener('input', (e) => {
            const url = e.target.value.trim();
            const preview = document.getElementById('avatarPreview');
            if (url) {
                preview.innerHTML = `<img src="${Utils.escape(url)}" onerror="this.parentNode.innerHTML='<i class=\\'fa-solid fa-user\\'></i>';">`;
            } else {
                preview.innerHTML = `<i class="fa-solid fa-user"></i>`;
            }
        });

        // 保存个人信息
        document.getElementById('profileSaveBtn').addEventListener('click', async () => {
            const data = {
                nickname: document.getElementById('profileNickname').value.trim() || null,
                avatar: document.getElementById('profileAvatar').value.trim() || null,
            };
            try {
                Loading.show('保存中...');
                const updated = await API.users.update(data);
                DataStore.setUser(updated);
                App.updateUserHeader();
                // 更新头像预览
                Toast.success('个人信息已更新');
            } catch (err) {
                Toast.error(err.message);
            } finally {
                Loading.hide();
            }
        });

        // 修改密码
        document.getElementById('passwordSaveBtn').addEventListener('click', async () => {
            const oldPwd = document.getElementById('oldPassword').value;
            const newPwd = document.getElementById('newPassword').value;
            const confirmPwd = document.getElementById('confirmPassword').value;
            if (!oldPwd || !newPwd || !confirmPwd) { Toast.warning('请填写完整'); return; }
            if (newPwd.length < 6) { Toast.warning('新密码至少 6 个字符'); return; }
            if (newPwd !== confirmPwd) { Toast.warning('两次输入的新密码不一致'); return; }
            if (oldPwd === newPwd) { Toast.warning('新密码不能与旧密码相同'); return; }
            try {
                Loading.show('修改中...');
                // 后端 UserUpdate 仅含 password 字段，无法验证旧密码
                // 这里直接更新密码，依赖后端逻辑
                await API.users.update({ password: newPwd });
                Toast.success('密码已修改，请重新登录');
                Loading.hide();
                setTimeout(() => {
                    DataStore.clearAuth();
                    App.showLogin();
                }, 1500);
            } catch (err) {
                Toast.error(err.message);
                Loading.hide();
            }
        });
    },
};


/* ============================================================
   9. 启动
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
