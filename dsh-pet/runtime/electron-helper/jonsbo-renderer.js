// Export only this pet's video frames, never the desktop or other application content.
(() => {
  if (!window.jonsboBridge) return;
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  let revision = -1,
    stateKey = '',
    sequence = 1000000;
  async function tick() {
    try {
      const pet = sprites[0];
      if (!pet || (!pet.gifPlayer?.ready && ![pet.videoA, pet.videoB].some((v) => v.readyState >= 2))) return;
      canvas.width = 480; // Reset drawing state (and recover from a previously tainted frame).
      const gradient = ctx.createLinearGradient(0, 0, 0, 480);
      gradient.addColorStop(0, '#0c182c');
      gradient.addColorStop(1, '#16344f');
      ctx.globalAlpha = 1;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 480, 480);
      if (pet.gifPlayer?.ready) ctx.drawImage(pet.gifPlayer.canvas, 0, 151, 480, 270);
      for (const v of pet.gifPlayer?.ready ? [] : [pet.videoA, pet.videoB]) {
        if (v.readyState < 2) continue;
        const style = getComputedStyle(v);
        const opacity = Number(style.opacity);
        if (opacity <= 0) continue;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(240, 421);
        const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
        ctx.scale(matrix.a, matrix.d);
        // Preserve the complete 16:9 animation, centered on the square panel.
        ctx.drawImage(v, -240, -270, 480, 270);
        ctx.restore();
      }
      // Use the actual visible bubble: it already applies work/whisper/balance
      // priority and carries the exact user-facing text, not stale backing state.
      const bubble = pet.bubble?.classList.contains('is-on') ? pet.bubble : null;
      const illustration = bubble?.querySelector('img');
      const imageReady = illustration?.complete && illustration.naturalWidth > 0;
      const text = bubble?.textContent?.trim() || (pet.workOn ? pet.workText : '') || '';
      if (text || imageReady) {
        ctx.fillStyle = '#f5f2fc';
        ctx.beginPath(); ctx.roundRect(16, 12, 448, 130, 16); ctx.fill();
        if (imageReady) {
          const scale = Math.min(104 / illustration.naturalWidth, 104 / illustration.naturalHeight);
          const w = illustration.naturalWidth * scale, h = illustration.naturalHeight * scale;
          ctx.drawImage(illustration, 26 + (104-w)/2, 25 + (104-h)/2, w, h);
        }
        const left = imageReady ? 145 : 30, width = 450-left;
        let lines = [], font = 18;
        do {
          ctx.font = font + 'px "Microsoft YaHei"'; lines = [''];
          for (const char of Array.from(text)) {
            if (char === '\n' || ctx.measureText(lines[lines.length-1]+char).width > width) lines.push('');
            if (char !== '\n') lines[lines.length-1] += char;
          }
          if (lines.length * (font+4) <= 108) break;
          font--;
        } while (font > 8);
        ctx.fillStyle = '#292439'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        lines.forEach((line,i) => ctx.fillText(line, left, 23+i*(font+4)));
      }
      ctx.fillStyle = '#d7eeff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = '16px "Microsoft YaHei"';
      ctx.fillText(S.characterLabel(pet.character) || '桌宠陪着你', 240, 454);
      const reply = await window.jonsboBridge.frame({
        png: canvas.toDataURL('image/png').split(',')[1],
        animation: pet.anim,character:pet.character,
      });
      window.__jonsboDebug = {
        animation: pet.anim,character:pet.character,
        lastFrameAt: Date.now(),
        error: reply.error || null,
        source: reply.source,
      };
      pet.applyDuet(reply.duet);
      if (reply.control && reply.control.revision !== revision) {
        const c = reply.control;
        revision = c.revision;
        const key = c.state + '\0' + c.message;
        if (key !== stateKey) {
          stateKey = key;
          pet.onWorkTick(
            { state: ['idle', 'sleeping'].includes(c.state) ? null : c.state, task: c.message || null },
            ++sequence,
          );
          if (c.state === 'sleeping') pet.onMenuAction({ label: '打瞌睡被惊醒', anim: '打瞌睡被惊醒' });
        }
      }
    } catch (e) {
      window.__jonsboDebug = { error: e.message };
    } finally {
      setTimeout(tick, 100);
    }
  }
  void tick();
})();
