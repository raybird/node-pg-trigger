import { BaseComponent } from '../lib/base-component.js';

export class App extends BaseComponent {
    constructor() {
        super();
        this.state = {
            currentDoc: 'intro',
            docs: [
                { id: 'intro', title: '🚀 簡介與快速開始' },
                { id: 'installation', title: '📦 安裝與配置' },
                { id: 'sdk-usage', title: '💎 SDK 使用指南' },
                { id: 'rls-security', title: '🔒 身分驗證與 RLS' }
            ],
            content: '載入中...'
        };
    }

    async connectedCallback() {
        await this.loadDoc(this.state.currentDoc);
        super.connectedCallback();
    }

    async loadDoc(id) {
        try {
            const response = await fetch(`./docs/${id}.html`);
            const html = await response.ok ? await response.text() : '<h1>404</h1>文件未找到';
            this.setState({ currentDoc: id, content: html });
        } catch (err) {
            this.setState({ content: '載入錯誤' });
        }
    }

    template() {
        return this.html`
            <div class="app-container">
                <aside class="sidebar">
                    <h2>PG Trigger</h2>
                    <nav>
                        ${this.state.docs.map(doc => `
                            <a class="nav-link ${this.state.currentDoc === doc.id ? 'active' : ''}" 
                               onclick="this.closest('x-app').loadDoc('${doc.id}')">
                                ${doc.title}
                            </a>
                        `).join('')}
                    </nav>
                </aside>
                <main class="main-content">
                    ${this.state.content}
                </main>
            </div>
        `;
    }
}

export const registerApp = () => customElements.define('x-app', App);
