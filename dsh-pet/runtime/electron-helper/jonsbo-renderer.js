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
      const gradient = ctx.createLinearGradient(0, 0, 0, 480);
      gradient.addColorStop(0, '#0c182c');
      gradient.addColorStop(1, '#16344f');
      ctx.globalAlpha = 1;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 480, 480);
      if (pet.gifPlayer?.ready) ctx.drawImage(pet.gifPlayer.canvas, 0, 105, 480, 270);
      for (const v of pet.gifPlayer?.ready ? [] : [pet.videoA, pet.videoB]) {
        if (v.readyState < 2) continue;
        const style = getComputedStyle(v);
        const opacity = Number(style.opacity);
        if (opacity <= 0) continue;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.translate(240, 375);
        const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
        ctx.scale(matrix.a, matrix.d);
        // Preserve the complete 16:9 animation, centered on the square panel.
        ctx.drawImage(v, -240, -270, 480, 270);
        ctx.restore();
      }
      const illustration = pet.bubble?.querySelector('img');
      if (illustration?.complete && illustration.naturalWidth > 0) {
        ctx.globalAlpha = 1;
        ctx.drawImage(illustration, 342, 12, 124, 124);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#d7eeff';
      ctx.textAlign = 'center';
      ctx.font = '20px "Microsoft YaHei"';
      const text = (pet.whisperOn && pet.whisperText || pet.workText || S.characterLabel(pet.character) || '桌宠陪着你').replace(/\n/g, ' ');
      let caption = text;
      while (caption.length && ctx.measureText(caption).width > 430) caption = caption.slice(0, -1);
      ctx.fillText(caption, 240, 428);
      ctx.font = '12px "Microsoft YaHei"';
      ctx.fillStyle = '#66b4c9';
      ctx.fillText('PET TRIO · JONSBO', 240, 459);
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
