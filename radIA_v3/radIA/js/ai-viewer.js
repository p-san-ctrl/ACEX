(function () {
  'use strict';

  const LABELS = {
    fracture: 'Possível fratura',
    boneanomaly: 'Anomalia óssea',
    bonelesion: 'Lesão óssea',
    foreignbody: 'Corpo estranho',
    metal: 'Material metálico',
    periostealreaction: 'Reação periosteal',
    pronatorsign: 'Sinal do pronador',
    softtissue: 'Alteração de partes moles',
    text: 'Texto/artefato',
  };

  function label(value) {
    return LABELS[value] || value || 'Achado';
  }

  function validBox(annotation) {
    return annotation?.type === 'bbox'
      && annotation.normalized === true
      && [annotation.x, annotation.y, annotation.width, annotation.height]
        .every(value => Number.isFinite(Number(value)));
  }

  function renderOverlay(container, findings) {
    if (!container) return;
    container.replaceChildren();
    findings.filter(item => validBox(item.anotacao)).forEach((finding, index) => {
      const box = document.createElement('div');
      const annotation = finding.anotacao;
      box.className = `ai-bounding-box ${finding.rotulo === 'fracture' ? 'ai-bounding-box--fracture' : ''}`;
      box.style.left = `${Number(annotation.x) * 100}%`;
      box.style.top = `${Number(annotation.y) * 100}%`;
      box.style.width = `${Number(annotation.width) * 100}%`;
      box.style.height = `${Number(annotation.height) * 100}%`;
      box.dataset.finding = String(index + 1);

      const tag = document.createElement('span');
      tag.className = 'ai-bounding-box__label';
      tag.textContent = `${index + 1}. ${label(finding.rotulo)} · ${Math.round(Number(finding.confianca) * 100)}%`;
      box.appendChild(tag);
      container.appendChild(box);
    });
  }

  function renderList(container, findings) {
    if (!container) return;
    container.replaceChildren();
    if (!findings.length) {
      container.innerHTML = '<li class="text-sm text-slate-500">Nenhum achado acima do limiar do modelo.</li>';
      return;
    }
    findings.forEach((finding, index) => {
      const item = document.createElement('li');
      item.className = 'flex items-start justify-between gap-3 rounded-lg border p-3 text-sm';
      const name = document.createElement('span');
      name.textContent = `${index + 1}. ${label(finding.rotulo)}`;
      const confidence = document.createElement('strong');
      confidence.textContent = `${Math.round(Number(finding.confianca) * 100)}%`;
      item.append(name, confidence);
      container.appendChild(item);
    });
  }

  window.RadiaAIViewer = { label, renderOverlay, renderList };
})();
