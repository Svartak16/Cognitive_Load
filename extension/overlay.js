(function() {
    if (document.getElementById('capture-overlay')) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'capture-overlay';
    Object.assign(canvas.style, {
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        zIndex: 2147483647, cursor: 'crosshair'
    });
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let isDrawing = false;
    let startX, startY;

    canvas.addEventListener('mousedown', e => {
        isDrawing = true;
        startX = e.clientX;
        startY = e.clientY;
    });

    canvas.addEventListener('mousemove', e => {
        if (!isDrawing) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Dim the background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Clear the selection box
        ctx.clearRect(startX, startY, e.clientX - startX, e.clientY - startY);
        ctx.strokeStyle = '#03a9f4';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, e.clientX - startX, e.clientY - startY);
    });

    canvas.addEventListener('mouseup', e => {
        isDrawing = false;
        const w = e.clientX - startX;
        const h = e.clientY - startY;
        if (Math.abs(w) < 5 || Math.abs(h) < 5) { // ignore tiny clicks
            canvas.remove();
            return;
        }
    
        const area = {
            x: Math.min(startX, e.clientX),
            y: Math.min(startY, e.clientY),
            w: Math.abs(w),
            h: Math.abs(h)
        };
        chrome.runtime.sendMessage({ action: "FINALIZE_CAPTURE", area });
        canvas.remove();
    });
})();