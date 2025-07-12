class LocalStorageViewer {
    constructor() {
        this.currentTab = null;
        this.localStorageData = [];
        this.filteredData = [];
        this.init();
    }

    async init() {
        await this.getCurrentTab();
        this.setupEventListeners();
        this.loadLocalStorage();
    }

    async getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;
            this.updateUrlInfo();
        } catch (error) {
            console.error('Error getting current tab:', error);
            this.showNotification('Error getting tab information', 'error');
        }
    }

    updateUrlInfo() {
        const urlElement = document.getElementById('current-url');
        if (this.currentTab && this.currentTab.url) {
            const url = new URL(this.currentTab.url);
            urlElement.textContent = url.hostname;
        } else {
            urlElement.textContent = 'Unknown site';
        }
    }

    setupEventListeners() {
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadLocalStorage();
        });

        document.getElementById('copy-all-btn').addEventListener('click', () => {
            this.copyAllLocalStorage();
        });

        document.getElementById('export-json-btn').addEventListener('click', () => {
            this.exportToJSON();
        });

        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearLocalStorage();
        });

        document.getElementById('search-input').addEventListener('input', (e) => {
            this.filterLocalStorage();
        });

        document.getElementById('filter-type').addEventListener('change', () => {
            this.filterLocalStorage();
        });
    }

    async loadLocalStorage() {
        this.showLoading(true);
        
        try {
            if (!this.currentTab) {
                throw new Error('Current tab not found');
            }

            // Выполняем скрипт в контексте активной вкладки
            const results = await chrome.scripting.executeScript({
                target: { tabId: this.currentTab.id },
                func: () => {
                    const data = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        const value = localStorage.getItem(key);
                        data.push({ key, value });
                    }
                    return data;
                }
            });

            if (results && results[0] && results[0].result) {
                this.localStorageData = results[0].result;
                this.filteredData = [...this.localStorageData];
                this.renderLocalStorage();
            } else {
                this.localStorageData = [];
                this.filteredData = [];
                this.renderLocalStorage();
            }
        } catch (error) {
            console.error('Error loading localStorage:', error);
            this.showNotification('Error loading localStorage', 'error');
            this.showEmptyState();
        } finally {
            this.showLoading(false);
        }
    }



    getDataType(value) {
        if (value === null || value === undefined) {
            return 'null';
        }
        
        // Пытаемся распарсить как JSON
        try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) {
                return 'json';
            }
        } catch {
            // Не JSON
        }
        
        // Проверяем другие типы
        if (value === 'true' || value === 'false') {
            return 'boolean';
        }
        
        if (!isNaN(value) && value !== '') {
            return 'number';
        }
        
        return 'string';
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    renderLocalStorage() {
        const tbody = document.getElementById('localStorage-tbody');
        const contentDiv = document.getElementById('localStorage-content');
        const emptyDiv = document.getElementById('empty-state');

        tbody.innerHTML = '';

        if (this.filteredData.length === 0) {
            contentDiv.classList.add('hidden');
            emptyDiv.classList.remove('hidden');
            return;
        }

        contentDiv.classList.remove('hidden');
        emptyDiv.classList.add('hidden');

        this.filteredData.forEach((item, index) => {
            const row = document.createElement('tr');
            
            const keyCell = document.createElement('td');
            keyCell.className = 'key-cell';
            keyCell.textContent = item.key;
            
            const dataType = this.getDataType(item.value);
            const typeCell = document.createElement('td');
            typeCell.className = 'type-cell';
            const typeBadge = document.createElement('span');
            typeBadge.className = `type-badge type-${dataType}`;
            typeBadge.textContent = dataType;
            typeCell.appendChild(typeBadge);
            
            const valueCell = document.createElement('td');
            valueCell.className = 'value-cell';
            valueCell.innerHTML = this.formatValue(item.value);
            
            const sizeCell = document.createElement('td');
            sizeCell.className = 'size-cell';
            sizeCell.textContent = this.formatBytes(new Blob([item.value]).size);
            
            const actionsCell = document.createElement('td');
            actionsCell.className = 'actions-cell';
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-btn copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.onclick = () => this.copyValue(item.key, item.value);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.onclick = () => this.deleteItem(item.key);
            
            actionsCell.appendChild(copyBtn);
            actionsCell.appendChild(deleteBtn);
            
            row.appendChild(keyCell);
            row.appendChild(typeCell);
            row.appendChild(valueCell);
            row.appendChild(sizeCell);
            row.appendChild(actionsCell);
            
            tbody.appendChild(row);
        });
        
        // Обновляем счетчик
        document.getElementById('items-count').textContent = this.filteredData.length;
    }

    formatValue(value) {
        if (value === null || value === undefined) {
            return '<span class="json-null">null</span>';
        }

        // Пытаемся распарсить как JSON
        try {
            const parsed = JSON.parse(value);
            return this.syntaxHighlight(JSON.stringify(parsed, null, 2));
        } catch {
            // Если не JSON, показываем как строку
            if (value.length > 100) {
                return `<div class="json-viewer">${this.escapeHtml(value.substring(0, 100))}...</div>`;
            }
            return `<div class="json-viewer">${this.escapeHtml(value)}</div>`;
        }
    }

    syntaxHighlight(json) {
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    filterLocalStorage() {
        const searchTerm = document.getElementById('search-input').value;
        const filterType = document.getElementById('filter-type').value;
        
        let filtered = [...this.localStorageData];
        
        // Фильтр по поиску
        if (searchTerm.trim()) {
            filtered = filtered.filter(item =>
                item.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.value.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        // Фильтр по типу
        if (filterType !== 'all') {
            filtered = filtered.filter(item => {
                const dataType = this.getDataType(item.value);
                return dataType === filterType;
            });
        }
        
        this.filteredData = filtered;
        this.renderLocalStorage();
    }

    async copyValue(key, value) {
        try {
            await navigator.clipboard.writeText(value);
            this.showNotification(`Value "${key}" copied`, 'success');
        } catch (error) {
            console.error('Copy error:', error);
            this.showNotification('Copy error', 'error');
        }
    }

    async copyAllLocalStorage() {
        try {
            const allData = this.filteredData.map(item => `${item.key}: ${item.value}`).join('\n');
            await navigator.clipboard.writeText(allData);
            this.showNotification('All localStorage copied', 'success');
        } catch (error) {
            console.error('Copy error:', error);
            this.showNotification('Copy error', 'error');
        }
    }

    async exportToJSON() {
        try {
            const exportData = {
                url: this.currentTab?.url || 'unknown',
                timestamp: new Date().toISOString(),
                localStorage: this.filteredData.reduce((acc, item) => {
                    acc[item.key] = item.value;
                    return acc;
                }, {})
            };
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `localStorage_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification('LocalStorage exported to JSON', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showNotification('Export error', 'error');
        }
    }

    async deleteItem(key) {
        if (!confirm(`Delete item "${key}"?`)) {
            return;
        }

        try {
            await chrome.scripting.executeScript({
                target: { tabId: this.currentTab.id },
                func: (keyToDelete) => {
                    localStorage.removeItem(keyToDelete);
                },
                args: [key]
            });

            this.showNotification(`Item "${key}" deleted`, 'success');
            this.loadLocalStorage(); // Reload data
        } catch (error) {
            console.error('Delete error:', error);
            this.showNotification('Delete error', 'error');
        }
    }

    async clearLocalStorage() {
        if (!confirm('Clear all localStorage? This action cannot be undone.')) {
            return;
        }

        try {
            await chrome.scripting.executeScript({
                target: { tabId: this.currentTab.id },
                func: () => {
                    localStorage.clear();
                }
            });

            this.showNotification('LocalStorage cleared', 'success');
            this.loadLocalStorage(); // Reload data
        } catch (error) {
            console.error('Clear error:', error);
            this.showNotification('Clear error', 'error');
        }
    }

    showLoading(show) {
        const loadingDiv = document.getElementById('loading');
        const contentDiv = document.getElementById('localStorage-content');
        const emptyDiv = document.getElementById('empty-state');

        if (show) {
            loadingDiv.classList.remove('hidden');
            contentDiv.classList.add('hidden');
            emptyDiv.classList.add('hidden');
        } else {
            loadingDiv.classList.add('hidden');
        }
    }

    showEmptyState() {
        const contentDiv = document.getElementById('localStorage-content');
        const emptyDiv = document.getElementById('empty-state');
        
        contentDiv.classList.add('hidden');
        emptyDiv.classList.remove('hidden');
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    new LocalStorageViewer();
}); 