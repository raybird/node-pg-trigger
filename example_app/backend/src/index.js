"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Serve static files from the 'frontend' directory
app.use(express_1.default.static(path_1.default.join(__dirname, '../../frontend')));
app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from backend!' });
});
app.listen(port, () => {
    console.log(`Backend listening at http://localhost:${port}`);
});
