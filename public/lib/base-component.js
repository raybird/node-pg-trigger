export class BaseComponent extends HTMLElement {
    constructor() {
        super();
        this.state = {};
    }

    connectedCallback() {
        this.render();
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.render();
    }

    // 簡單的 HTML 轉義與樣版字串處理
    html(strings, ...values) {
        return strings.reduce((acc, str, i) => {
            let val = values[i] === undefined ? '' : values[i];
            return acc + str + val;
        }, '');
    }

    render() {
        this.innerHTML = this.template();
    }

    template() { return ''; }
}
