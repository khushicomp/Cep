export function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = document.createElement('span');
    icon.style.fontSize = '1.25rem';
    icon.style.marginRight = '0.75rem';
    icon.textContent = type === 'success' ? '✓' : '✗';
    toast.appendChild(icon);
    toast.appendChild(document.createTextNode(String(message)));
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function showLoading() {
    if (document.getElementById('loading-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    const label = document.createElement('p');
    label.textContent = 'Processing...';
    overlay.append(spinner, label);
    document.body.appendChild(overlay);
}

export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.remove();
    }
}
