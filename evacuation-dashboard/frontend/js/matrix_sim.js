/**
 * matrix_sim.js - 8x8 LED Matrix MAX7219 FC-16 Hardware Simulation
 * Matches the exact bit patterns from matrixdisplay.ino
 */

const MatrixSim = {
  // Arrow bit patterns (8 frames upward animation) from matrixdisplay.ino
  arrows: [
    [0x18, 0x3C, 0x66, 0xC3, 0x18, 0x3C, 0x66, 0xC3], // arrow1
    [0x3C, 0x66, 0xC3, 0x18, 0x3C, 0x66, 0xC3, 0x18], // arrow2
    [0x66, 0xC3, 0x18, 0x3C, 0x66, 0xC3, 0x18, 0x3C], // arrow3
    [0xC3, 0x18, 0x3C, 0x66, 0xC3, 0x18, 0x3C, 0x66], // arrow4
    [0x18, 0x3C, 0x66, 0xC3, 0x18, 0x3C, 0x66, 0xC3], // arrow5
    [0x3C, 0x66, 0xC3, 0x18, 0x3C, 0x66, 0xC3, 0x18], // arrow6
    [0x66, 0xC3, 0x18, 0x3C, 0x66, 0xC3, 0x18, 0x3C], // arrow7
    [0xC3, 0x18, 0x3C, 0x66, 0xC3, 0x18, 0x3C, 0x66]  // arrow8
  ],

  // Reverse / Downward arrow bit patterns
  arrowsDown: [
    [0xC3, 0x66, 0x3C, 0x18, 0xC3, 0x66, 0x3C, 0x18],
    [0x66, 0x3C, 0x18, 0xC3, 0x66, 0x3C, 0x18, 0xC3],
    [0x3C, 0x18, 0xC3, 0x66, 0x3C, 0x18, 0xC3, 0x66],
    [0x18, 0xC3, 0x66, 0x3C, 0x18, 0xC3, 0x66, 0x3C],
    [0xC3, 0x66, 0x3C, 0x18, 0xC3, 0x66, 0x3C, 0x18],
    [0x66, 0x3C, 0x18, 0xC3, 0x66, 0x3C, 0x18, 0xC3],
    [0x3C, 0x18, 0xC3, 0x66, 0x3C, 0x18, 0xC3, 0x66],
    [0x18, 0xC3, 0x66, 0x3C, 0x18, 0xC3, 0x66, 0x3C]
  ],

  // Flashing X Cross from matrixdisplay.ino
  cross: [
    0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81
  ],

  // State timers
  arrowFrame: 0,
  flashState: false,
  lastArrowTime: 0,
  lastFlashTime: 0,
  animationId: null,

  init() {
    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
  },

  renderLoop(timestamp) {
    if (!this.lastArrowTime) this.lastArrowTime = timestamp;
    if (!this.lastFlashTime) this.lastFlashTime = timestamp;

    // Advance arrow frame every 120ms (matches Arduino 120ms)
    if (timestamp - this.lastArrowTime > 120) {
      this.arrowFrame = (this.arrowFrame + 1) % 8;
      this.lastArrowTime = timestamp;
    }

    // Toggle flash state every 300ms (matches Arduino 300ms)
    if (timestamp - this.lastFlashTime > 300) {
      this.flashState = !this.flashState;
      this.lastFlashTime = timestamp;
    }

    // Redraw currently active inspector matrix canvases
    if (window.selectedNodeData) {
      this.drawMatrix('matrix-a-canvas', window.selectedNodeData.display_a, 'A');
      this.drawMatrix('matrix-b-canvas', window.selectedNodeData.display_b, 'B');
    }

    requestAnimationFrame(this.renderLoop);
  },

  drawMatrix(canvasId, displayState, side) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const pixelSize = size / 8;
    const padding = 1.5;

    ctx.fillStyle = '#080a0f';
    ctx.fillRect(0, 0, size, size);

    const isStop = (displayState === 'STOP' || displayState === 'BLOCKED' || displayState === 'X');
    let matrixData = [];

    if (isStop) {
      // If flashing X is OFF this tick, show blank/dim
      matrixData = this.flashState ? this.cross : [0,0,0,0,0,0,0,0];
    } else {
      // Moving arrow
      matrixData = (side === 'B') ? this.arrowsDown[this.arrowFrame] : this.arrows[this.arrowFrame];
    }

    // Draw 8x8 circular LED pixels
    for (let r = 0; r < 8; r++) {
      const rowByte = matrixData[r] || 0;
      for (let c = 0; c < 8; c++) {
        const bit = (rowByte >> (7 - c)) & 1;
        const x = c * pixelSize + pixelSize / 2;
        const y = r * pixelSize + pixelSize / 2;
        const radius = (pixelSize / 2) - padding;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        if (bit === 1) {
          ctx.fillStyle = isStop ? '#ef4444' : '#10b981';
          ctx.fill();
        } else {
          // Off pixel (dim dark slot)
          ctx.fillStyle = '#1c2130';
          ctx.fill();
        }
      }
    }
  }
};

window.MatrixSim = MatrixSim;
