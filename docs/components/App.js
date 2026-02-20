import { BaseComponent } from '../lib/base-component.js';

export class App extends BaseComponent {
    constructor() {
        super();
        this.state = {
            isMenuOpen: false,
            currentDoc: 'intro',
            docs: [
                { id: 'intro', title: '🚀 簡介與快速開始' },
                { id: 'installation', title: '📦 安裝與配置' },
                { id: 'sdk-usage', title: '💎 SDK 使用指南' },
                { id: 'relational-data', title: '🔗 關聯資料查詢' },
                { id: 'rls-security', title: '🔒 身分驗證與 RLS' }
            ],
            content: '載入中...'
        };
    }

    async connectedCallback() {
        await this.loadDoc(this.state.currentDoc);
        super.connectedCallback();
    }

    toggleMenu() {
        this.setState({ isMenuOpen: !this.state.isMenuOpen });
    }

    closeMenu() {
        this.setState({ isMenuOpen: false });
    }

    async loadDoc(id) {
        try {
            const response = await fetch(`./docs/${id}.html`);
            const html = await response.ok ? await response.text() : '<h1>404</h1>文件未找到';
            // 點擊後自動關閉選單 (手機版)
            this.setState({ currentDoc: id, content: html, isMenuOpen: false });
        } catch (err) {
            this.setState({ content: '載入錯誤' });
        }
    }

    template() {
        return this.html`
            <div class="app-container">
                <!-- 手機版漢堡按鈕 -->
                <button class="hamburger-btn" aria-label="Toggle Menu" onclick="this.closest('x-app').toggleMenu()">
                    <span style="font-size: 1.2rem;">${this.state.isMenuOpen ? '✕' : '☰'}</span>
                </button>

                <!-- 手機版遮罩層 -->
                <div class="menu-overlay ${this.state.isMenuOpen ? 'open' : ''}" 
                     onclick="this.closest('x-app').closeMenu()"></div>

                <!-- 側邊欄 -->
                <aside class="sidebar ${this.state.isMenuOpen ? 'open' : ''}">
                    <div class="sidebar-header">
                        <h2>PG Trigger</h2>
                    </div>
                    <nav>
                        ${this.state.docs.map(doc => `
                            <a class="nav-link ${this.state.currentDoc === doc.id ? 'active' : ''}" 
                               onclick="this.closest('x-app').loadDoc('${doc.id}')">
                                ${doc.title}
                            </a>
                        `).join('')}
                    </nav>
                </aside>

                <!-- 主內容區 -->
                <main class="main-content">
                    ${this.state.content}
                </main>
            </div>
        `;
    }
}

export const registerApp = () => customElements.define('x-app', App);
