(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const APP_VERSION = 1;
  const STORAGE_KEY = 'aloeworld-safety-plan-360-project';
  let storageEnabled = true;

  const canvas = document.getElementById('canvas');
  const stageWrapper = document.getElementById('stageWrapper');
  const drawingLayer = document.getElementById('drawingLayer');
  const previewLayer = document.getElementById('previewLayer');
  const selectionLayer = document.getElementById('selectionLayer');
  const pageBackground = document.getElementById('pageBackground');
  const gridLayer = document.getElementById('gridLayer');
  const emptyState = document.getElementById('emptyState');

  const state = {
    tool: 'select',
    entities: [],
    selectedId: null,
    page: { width: 1123, height: 794 },
    camera: { x: 0, y: 0, zoom: 1 },
    gridSize: 10,
    snap: true,
    showGrid: true,
    drawingScale: 50,
    interaction: null,
    history: [],
    historyIndex: -1,
    documentTitle: 'Plano de Emergência e Evacuação',
    autosaveTimer: null,
  };

  const toolLabels = {
    select: 'Selecionar',
    pan: 'Mão / mover vista',
    wall: 'Desenhar parede',
    room: 'Desenhar divisão',
    door: 'Adicionar porta',
    window: 'Adicionar janela',
    route: 'Rota de evacuação',
    dimension: 'Adicionar cota',
    text: 'Adicionar texto',
    image: 'Inserir imagem',
  };

  const symbols = [
    { type: 'extinguisher', name: 'Extintor', color: '#d93636', group: 'Combate a incêndio' },
    { type: 'firehose', name: 'Carretel / BIA', color: '#d93636', group: 'Combate a incêndio' },
    { type: 'hydrant', name: 'Hidrante', color: '#d93636', group: 'Combate a incêndio' },
    { type: 'alarm', name: 'Alarme manual', color: '#d93636', group: 'Alarme e deteção' },
    { type: 'smoke', name: 'Detetor de fumo', color: '#d93636', group: 'Alarme e deteção' },
    { type: 'emergencylight', name: 'Iluminação de emergência', color: '#efb300', group: 'Alarme e deteção' },
    { type: 'exit', name: 'Saída de emergência', color: '#159447', group: 'Evacuação' },
    { type: 'assembly', name: 'Ponto de encontro', color: '#159447', group: 'Evacuação' },
    { type: 'stairs', name: 'Escadas', color: '#159447', group: 'Evacuação' },
    { type: 'youarehere', name: 'Você está aqui', color: '#1677c8', group: 'Informação' },
    { type: 'firstaid', name: 'Primeiros socorros', color: '#159447', group: 'Informação' },
    { type: 'phone', name: 'Telefone de emergência', color: '#1677c8', group: 'Informação' },
  ];

  const els = {
    documentTitle: document.getElementById('documentTitle'),
    activeToolLabel: document.getElementById('activeToolLabel'),
    cursorPosition: document.getElementById('cursorPosition'),
    selectionStatus: document.getElementById('selectionStatus'),
    autosaveStatus: document.getElementById('autosaveStatus'),
    zoomLabel: document.getElementById('zoomLabel'),
    gridToggle: document.getElementById('gridToggle'),
    snapToggle: document.getElementById('snapToggle'),
    pageFormat: document.getElementById('pageFormat'),
    pageWidth: document.getElementById('pageWidth'),
    pageHeight: document.getElementById('pageHeight'),
    drawingScale: document.getElementById('drawingScale'),
    noSelection: document.getElementById('noSelection'),
    propertiesForm: document.getElementById('propertiesForm'),
    propType: document.getElementById('propType'),
    propName: document.getElementById('propName'),
    propX: document.getElementById('propX'),
    propY: document.getElementById('propY'),
    propW: document.getElementById('propW'),
    propH: document.getElementById('propH'),
    propRotation: document.getElementById('propRotation'),
    propStroke: document.getElementById('propStroke'),
    propFill: document.getElementById('propFill'),
    propStrokeWidth: document.getElementById('propStrokeWidth'),
    propOpacity: document.getElementById('propOpacity'),
    propText: document.getElementById('propText'),
    propLocked: document.getElementById('propLocked'),
    textPropWrap: document.getElementById('textPropWrap'),
    templatesDialog: document.getElementById('templatesDialog'),
    exportMenu: document.getElementById('exportMenu'),
    toast: document.getElementById('toast'),
    projectFileInput: document.getElementById('projectFileInput'),
    imageFileInput: document.getElementById('imageFileInput'),
    symbolLibrary: document.getElementById('symbolLibrary'),
    symbolSearch: document.getElementById('symbolSearch'),
  };

  function svgEl(tag, attrs = {}, text = null) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) el.setAttribute(key, String(value));
    });
    if (text !== null) el.textContent = text;
    return el;
  }

  function uid(prefix = 'e') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function snap(value) {
    return state.snap ? Math.round(value / state.gridSize) * state.gridSize : value;
  }

  function formatMeters(units) {
    return `${(Math.abs(units) / 100).toFixed(2).replace('.', ',')} m`;
  }

  function selectedEntity() {
    return state.entities.find((entity) => entity.id === state.selectedId) || null;
  }

  function entityBounds(entity) {
    if (!entity) return { x: 0, y: 0, w: 0, h: 0 };
    if (entity.type === 'wall' || entity.type === 'route' || entity.type === 'dimension') {
      const xs = entity.points.map((p) => p.x);
      const ys = entity.points.map((p) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
        h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
      };
    }
    return { x: entity.x, y: entity.y, w: entity.w || 1, h: entity.h || 1 };
  }

  function normalizeColor(value, fallback) {
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value;
    return fallback;
  }

  function defaultEntity(type, x, y) {
    const common = {
      id: uid(type),
      type,
      name: toolLabels[type] || type,
      x: snap(x),
      y: snap(y),
      w: 100,
      h: 60,
      rotation: 0,
      fill: '#ffffff',
      stroke: '#24313d',
      strokeWidth: 2,
      opacity: 1,
      text: '',
      locked: false,
    };

    if (type === 'room') return { ...common, w: 300, h: 200, fill: '#ffffff', strokeWidth: 8, name: 'Divisão' };
    if (type === 'door') return { ...common, w: 90, h: 90, fill: '#ffffff', strokeWidth: 4, name: 'Porta' };
    if (type === 'window') return { ...common, w: 100, h: 20, fill: '#cceaf8', strokeWidth: 3, name: 'Janela' };
    if (type === 'text') return { ...common, w: 220, h: 40, fill: '#24313d', stroke: '#24313d', strokeWidth: 0, text: 'Texto', fontSize: 20, name: 'Texto' };
    if (type === 'image') return { ...common, w: 400, h: 260, fill: '#ffffff', stroke: '#9badba', strokeWidth: 1, name: 'Imagem de fundo', src: '' };
    return common;
  }

  function symbolEntity(type, x, y) {
    const meta = symbols.find((symbol) => symbol.type === type);
    return {
      id: uid(type),
      type: 'symbol',
      symbolType: type,
      name: meta ? meta.name : type,
      x: snap(x - 32),
      y: snap(y - 32),
      w: type === 'exit' ? 110 : 64,
      h: 64,
      rotation: 0,
      fill: meta ? meta.color : '#159447',
      stroke: '#ffffff',
      strokeWidth: 2,
      opacity: 1,
      text: meta ? meta.name : type,
      locked: false,
    };
  }

  function addEntity(entity, commit = true) {
    state.entities.push(entity);
    state.selectedId = entity.id;
    renderAll();
    if (commit) commitHistory();
  }

  function removeSelected() {
    const entity = selectedEntity();
    if (!entity || entity.locked) return;
    state.entities = state.entities.filter((item) => item.id !== entity.id);
    state.selectedId = null;
    renderAll();
    commitHistory();
  }

  function duplicateSelected() {
    const entity = selectedEntity();
    if (!entity) return;
    const copy = deepClone(entity);
    copy.id = uid(entity.type);
    copy.name = `${entity.name || entity.type} (cópia)`;
    if (copy.points) copy.points = copy.points.map((p) => ({ x: p.x + 20, y: p.y + 20 }));
    else {
      copy.x += 20;
      copy.y += 20;
    }
    addEntity(copy);
  }

  function moveEntity(entity, dx, dy) {
    if (entity.points) {
      entity.points.forEach((point) => {
        point.x = snap(point.x + dx);
        point.y = snap(point.y + dy);
      });
    } else {
      entity.x = snap(entity.x + dx);
      entity.y = snap(entity.y + dy);
    }
  }

  function createCommonGroup(entity) {
    const bounds = entityBounds(entity);
    const group = svgEl('g', {
      class: `entity${entity.locked ? ' locked' : ''}`,
      'data-id': entity.id,
      opacity: entity.opacity ?? 1,
      transform: entity.points ? '' : `rotate(${entity.rotation || 0} ${bounds.x + bounds.w / 2} ${bounds.y + bounds.h / 2})`,
    });
    return group;
  }

  function renderWall(entity) {
    const group = createCommonGroup(entity);
    const [a, b] = entity.points;
    group.appendChild(svgEl('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: entity.stroke || '#24313d',
      'stroke-width': entity.strokeWidth || 12,
      'stroke-linecap': 'square',
      class: 'hover-target',
    }));
    return group;
  }

  function renderRoom(entity) {
    const group = createCommonGroup(entity);
    group.appendChild(svgEl('rect', {
      x: entity.x, y: entity.y, width: entity.w, height: entity.h,
      fill: entity.fill || '#ffffff',
      stroke: entity.stroke || '#24313d',
      'stroke-width': entity.strokeWidth || 8,
    }));
    if (entity.text) {
      group.appendChild(svgEl('text', {
        x: entity.x + entity.w / 2,
        y: entity.y + entity.h / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: '#506170',
        'font-size': entity.fontSize || 18,
        'font-weight': 600,
      }, entity.text));
    }
    return group;
  }

  function renderDoor(entity) {
    const group = createCommonGroup(entity);
    const x = entity.x;
    const y = entity.y;
    const w = entity.w;
    const h = entity.h;
    group.appendChild(svgEl('rect', { x, y, width: w, height: h, fill: 'transparent', class: 'hover-target' }));
    group.appendChild(svgEl('line', { x1: x, y1: y + h, x2: x, y2: y, stroke: entity.stroke, 'stroke-width': entity.strokeWidth }));
    group.appendChild(svgEl('line', { x1: x, y1: y + h, x2: x + w, y2: y + h, stroke: entity.stroke, 'stroke-width': entity.strokeWidth }));
    group.appendChild(svgEl('path', {
      d: `M ${x} ${y} A ${w} ${h} 0 0 1 ${x + w} ${y + h}`,
      fill: 'none', stroke: entity.stroke, 'stroke-width': Math.max(1, entity.strokeWidth / 2), 'stroke-dasharray': '5 4',
    }));
    return group;
  }

  function renderWindow(entity) {
    const group = createCommonGroup(entity);
    const x = entity.x;
    const y = entity.y;
    const w = entity.w;
    const h = entity.h;
    group.appendChild(svgEl('rect', { x, y, width: w, height: h, fill: entity.fill, stroke: entity.stroke, 'stroke-width': entity.strokeWidth }));
    group.appendChild(svgEl('line', { x1: x + w / 2, y1: y, x2: x + w / 2, y2: y + h, stroke: entity.stroke, 'stroke-width': 1.5 }));
    return group;
  }

  function renderRoute(entity) {
    const group = createCommonGroup(entity);
    const points = entity.points.map((p) => `${p.x},${p.y}`).join(' ');
    group.appendChild(svgEl('polyline', {
      points,
      fill: 'none',
      stroke: entity.stroke || '#159447',
      'stroke-width': entity.strokeWidth || 8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'marker-end': 'url(#arrowGreen)',
    }));
    return group;
  }

  function renderDimension(entity) {
    const group = createCommonGroup(entity);
    const [a, b] = entity.points;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    group.appendChild(svgEl('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: entity.stroke || '#24313d',
      'stroke-width': entity.strokeWidth || 1.5,
      'marker-start': 'url(#arrowBlack)',
      'marker-end': 'url(#arrowBlack)',
    }));
    group.appendChild(svgEl('text', {
      x: mx, y: my - 8,
      'text-anchor': 'middle',
      fill: entity.stroke || '#24313d',
      'font-size': 15,
      'font-weight': 700,
      'paint-order': 'stroke',
      stroke: '#ffffff',
      'stroke-width': 4,
    }, entity.text || formatMeters(length)));
    return group;
  }

  function renderText(entity) {
    const group = createCommonGroup(entity);
    group.appendChild(svgEl('rect', { x: entity.x, y: entity.y, width: entity.w, height: entity.h, fill: 'transparent', class: 'hover-target' }));
    const text = svgEl('text', {
      x: entity.x,
      y: entity.y + (entity.fontSize || 20),
      fill: entity.fill || '#24313d',
      'font-size': entity.fontSize || 20,
      'font-weight': entity.fontWeight || 600,
    });
    String(entity.text || '').split('\n').forEach((line, index) => {
      const tspan = svgEl('tspan', { x: entity.x, dy: index === 0 ? 0 : (entity.fontSize || 20) * 1.2 }, line);
      text.appendChild(tspan);
    });
    group.appendChild(text);
    return group;
  }

  function renderImage(entity) {
    const group = createCommonGroup(entity);
    group.appendChild(svgEl('rect', { x: entity.x, y: entity.y, width: entity.w, height: entity.h, fill: '#ffffff', stroke: entity.stroke, 'stroke-width': entity.strokeWidth }));
    if (entity.src) {
      group.appendChild(svgEl('image', {
        href: entity.src,
        x: entity.x,
        y: entity.y,
        width: entity.w,
        height: entity.h,
        preserveAspectRatio: 'xMidYMid meet',
      }));
    }
    return group;
  }

  function symbolGraphic(type, x, y, w, h, fill) {
    const group = svgEl('g');
    const cx = x + w / 2;
    const cy = y + h / 2;
    const size = Math.min(w, h);

    const baseRect = () => group.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 5, fill }));
    const white = '#ffffff';

    if (type === 'exit') {
      baseRect();
      group.appendChild(svgEl('circle', { cx: x + 24, cy: y + 17, r: 6, fill: white }));
      group.appendChild(svgEl('path', { d: `M ${x + 23} ${y + 25} L ${x + 38} ${y + 31} L ${x + 47} ${y + 22} M ${x + 34} ${y + 30} L ${x + 30} ${y + 45} M ${x + 36} ${y + 32} L ${x + 47} ${y + 44}`, stroke: white, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }));
      group.appendChild(svgEl('path', { d: `M ${x + 63} ${y + 32} H ${x + w - 14} M ${x + w - 25} ${y + 21} L ${x + w - 14} ${y + 32} L ${x + w - 25} ${y + 43}`, stroke: white, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      return group;
    }

    baseRect();

    switch (type) {
      case 'extinguisher':
        group.appendChild(svgEl('rect', { x: cx - 10, y: y + 20, width: 20, height: 30, rx: 5, fill: white }));
        group.appendChild(svgEl('rect', { x: cx - 6, y: y + 14, width: 12, height: 9, rx: 2, fill: white }));
        group.appendChild(svgEl('path', { d: `M ${cx + 5} ${y + 16} Q ${cx + 18} ${y + 14} ${cx + 18} ${y + 26}`, fill: 'none', stroke: white, 'stroke-width': 4, 'stroke-linecap': 'round' }));
        break;
      case 'firehose':
        group.appendChild(svgEl('circle', { cx, cy, r: size * .27, fill: 'none', stroke: white, 'stroke-width': 5 }));
        group.appendChild(svgEl('circle', { cx, cy, r: size * .09, fill: 'none', stroke: white, 'stroke-width': 4 }));
        group.appendChild(svgEl('line', { x1: cx + 6, y1: cy + 6, x2: x + w - 10, y2: y + h - 10, stroke: white, 'stroke-width': 5, 'stroke-linecap': 'round' }));
        break;
      case 'hydrant':
        group.appendChild(svgEl('path', { d: `M ${cx - 12} ${y + 49} V ${y + 25} Q ${cx - 12} ${y + 15} ${cx} ${y + 15} Q ${cx + 12} ${y + 15} ${cx + 12} ${y + 25} V ${y + 49} M ${cx - 18} ${y + 49} H ${cx + 18} M ${cx - 20} ${y + 30} H ${cx + 20}`, stroke: white, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }));
        break;
      case 'alarm':
        group.appendChild(svgEl('rect', { x: cx - 17, y: cy - 17, width: 34, height: 34, rx: 4, fill: 'none', stroke: white, 'stroke-width': 4 }));
        group.appendChild(svgEl('circle', { cx, cy, r: 8, fill: white }));
        break;
      case 'smoke':
        group.appendChild(svgEl('circle', { cx, cy, r: 19, fill: 'none', stroke: white, 'stroke-width': 4 }));
        group.appendChild(svgEl('path', { d: `M ${cx - 13} ${cy + 4} Q ${cx - 4} ${cy - 7} ${cx + 5} ${cy + 2} Q ${cx + 11} ${cy + 8} ${cx + 16} ${cy - 1}`, stroke: white, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }));
        break;
      case 'emergencylight':
        group.appendChild(svgEl('path', { d: `M ${cx - 20} ${cy + 12} H ${cx + 20} L ${cx + 14} ${cy - 12} H ${cx - 14} Z`, fill: white }));
        group.appendChild(svgEl('path', { d: `M ${cx - 27} ${cy + 16} L ${cx - 36} ${cy + 26} M ${cx} ${cy + 16} V ${cy + 30} M ${cx + 27} ${cy + 16} L ${cx + 36} ${cy + 26}`, stroke: white, 'stroke-width': 3 }));
        break;
      case 'assembly':
        group.appendChild(svgEl('circle', { cx, cy, r: 23, fill: 'none', stroke: white, 'stroke-width': 3 }));
        [[-11,-9],[11,-9],[-11,11],[11,11]].forEach(([dx,dy]) => {
          group.appendChild(svgEl('circle', { cx: cx + dx, cy: cy + dy, r: 4, fill: white }));
          group.appendChild(svgEl('line', { x1: cx + dx, y1: cy + dy + 5, x2: cx + dx, y2: cy + dy + 13, stroke: white, 'stroke-width': 3 }));
        });
        break;
      case 'stairs':
        group.appendChild(svgEl('path', { d: `M ${x + 12} ${y + 47} H ${x + 24} V ${y + 37} H ${x + 36} V ${y + 27} H ${x + 48} V ${y + 17} H ${x + 56}`, stroke: white, 'stroke-width': 5, fill: 'none' }));
        break;
      case 'youarehere':
        group.appendChild(svgEl('circle', { cx, cy, r: 18, fill: white }));
        group.appendChild(svgEl('circle', { cx, cy, r: 8, fill }));
        group.appendChild(svgEl('path', { d: `M ${cx} ${cy + 25} L ${cx - 8} ${cy + 12} H ${cx + 8} Z`, fill: white }));
        break;
      case 'firstaid':
        group.appendChild(svgEl('rect', { x: cx - 7, y: cy - 22, width: 14, height: 44, fill: white }));
        group.appendChild(svgEl('rect', { x: cx - 22, y: cy - 7, width: 44, height: 14, fill: white }));
        break;
      case 'phone':
        group.appendChild(svgEl('path', { d: `M ${cx - 16} ${cy - 20} Q ${cx - 22} ${cy - 14} ${cx - 14} ${cy + 2} Q ${cx - 3} ${cy + 22} ${cx + 15} ${cy + 17} L ${cx + 21} ${cy + 7} L ${cx + 8} ${cy - 1} L ${cx + 2} ${cy + 6} Q ${cx - 6} ${cy + 3} ${cx - 9} ${cy - 6} L ${cx - 2} ${cy - 12} Z`, fill: white }));
        break;
      default:
        group.appendChild(svgEl('circle', { cx, cy, r: 18, fill: white }));
    }
    return group;
  }

  function renderSymbol(entity) {
    const group = createCommonGroup(entity);
    group.appendChild(symbolGraphic(entity.symbolType, entity.x, entity.y, entity.w, entity.h, entity.fill));
    return group;
  }

  function renderEntity(entity) {
    switch (entity.type) {
      case 'wall': return renderWall(entity);
      case 'room': return renderRoom(entity);
      case 'door': return renderDoor(entity);
      case 'window': return renderWindow(entity);
      case 'route': return renderRoute(entity);
      case 'dimension': return renderDimension(entity);
      case 'text': return renderText(entity);
      case 'image': return renderImage(entity);
      case 'symbol': return renderSymbol(entity);
      default: return createCommonGroup(entity);
    }
  }

  function renderSelection() {
    selectionLayer.replaceChildren();
    const entity = selectedEntity();
    if (!entity) return;
    const bounds = entityBounds(entity);
    const pad = 7 / state.camera.zoom;
    const box = svgEl('rect', {
      class: 'selection-box',
      x: bounds.x - pad,
      y: bounds.y - pad,
      width: bounds.w + pad * 2,
      height: bounds.h + pad * 2,
      rx: 2,
    });
    selectionLayer.appendChild(box);
    const r = 4 / state.camera.zoom;
    const points = [
      [bounds.x - pad, bounds.y - pad],
      [bounds.x + bounds.w + pad, bounds.y - pad],
      [bounds.x - pad, bounds.y + bounds.h + pad],
      [bounds.x + bounds.w + pad, bounds.y + bounds.h + pad],
    ];
    points.forEach(([cx, cy]) => selectionLayer.appendChild(svgEl('circle', { class: 'selection-handle', cx, cy, r })));
  }

  function renderAll() {
    drawingLayer.replaceChildren();
    state.entities.forEach((entity) => drawingLayer.appendChild(renderEntity(entity)));
    renderSelection();
    updatePropertiesPanel();
    updateStatus();
    emptyState.classList.toggle('hidden', state.entities.length > 0);
    scheduleAutosave();
  }

  function updateStatus() {
    const entity = selectedEntity();
    els.selectionStatus.textContent = entity ? `${entity.name || entity.type} selecionado` : 'Nenhum objeto selecionado';
    els.zoomLabel.textContent = `${Math.round(state.camera.zoom * 100)}%`;
    els.activeToolLabel.textContent = toolLabels[state.tool] || state.tool;
    stageWrapper.style.cursor = state.tool === 'pan' ? 'grab' : (state.tool === 'select' ? 'default' : 'crosshair');
  }

  function updatePropertiesPanel() {
    const entity = selectedEntity();
    els.noSelection.classList.toggle('hidden', Boolean(entity));
    els.propertiesForm.classList.toggle('hidden', !entity);
    if (!entity) return;
    const bounds = entityBounds(entity);
    els.propType.value = entity.type === 'symbol' ? `Símbolo: ${entity.name}` : (toolLabels[entity.type] || entity.type);
    els.propName.value = entity.name || '';
    els.propX.value = Math.round(bounds.x);
    els.propY.value = Math.round(bounds.y);
    els.propW.value = Math.round(bounds.w);
    els.propH.value = Math.round(bounds.h);
    els.propRotation.value = entity.rotation || 0;
    els.propStroke.value = normalizeColor(entity.stroke, '#24313d');
    els.propFill.value = normalizeColor(entity.fill, '#ffffff');
    els.propStrokeWidth.value = entity.strokeWidth ?? 2;
    els.propOpacity.value = entity.opacity ?? 1;
    els.propText.value = entity.text || '';
    els.propLocked.checked = Boolean(entity.locked);
    els.textPropWrap.classList.toggle('hidden', !['text', 'room', 'dimension', 'symbol'].includes(entity.type));
  }

  function applyViewBox() {
    const rect = stageWrapper.getBoundingClientRect();
    const vw = rect.width / state.camera.zoom;
    const vh = rect.height / state.camera.zoom;
    canvas.setAttribute('viewBox', `${state.camera.x} ${state.camera.y} ${vw} ${vh}`);
    renderSelection();
    updateStatus();
  }

  function fitPage() {
    const rect = stageWrapper.getBoundingClientRect();
    const padding = 60;
    const zoom = Math.min((rect.width - padding) / state.page.width, (rect.height - padding) / state.page.height);
    state.camera.zoom = clamp(zoom, 0.1, 4);
    const vw = rect.width / state.camera.zoom;
    const vh = rect.height / state.camera.zoom;
    state.camera.x = (state.page.width - vw) / 2;
    state.camera.y = (state.page.height - vh) / 2;
    applyViewBox();
  }

  function zoomBy(factor, clientX = null, clientY = null) {
    const before = clientX !== null ? clientToCanvas(clientX, clientY) : null;
    state.camera.zoom = clamp(state.camera.zoom * factor, 0.1, 5);
    if (before && clientX !== null) {
      const rect = stageWrapper.getBoundingClientRect();
      state.camera.x = before.x - (clientX - rect.left) / state.camera.zoom;
      state.camera.y = before.y - (clientY - rect.top) / state.camera.zoom;
    }
    applyViewBox();
  }

  function clientToCanvas(clientX, clientY) {
    const rect = stageWrapper.getBoundingClientRect();
    return {
      x: state.camera.x + (clientX - rect.left) / state.camera.zoom,
      y: state.camera.y + (clientY - rect.top) / state.camera.zoom,
    };
  }

  function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll('.tool').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
    previewLayer.replaceChildren();
    updateStatus();
    if (tool === 'image') {
      els.imageFileInput.value = '';
      els.imageFileInput.click();
      setTool('select');
    }
  }

  function setSelected(id) {
    state.selectedId = id;
    renderSelection();
    updatePropertiesPanel();
    updateStatus();
  }

  function findEntityElement(target) {
    return target.closest ? target.closest('[data-id]') : null;
  }

  function createPreview(type, start, current) {
    previewLayer.replaceChildren();
    let preview = null;
    if (type === 'wall') {
      preview = svgEl('line', { x1: start.x, y1: start.y, x2: current.x, y2: current.y, stroke: '#159447', 'stroke-width': 12, opacity: .65 });
    } else if (type === 'room') {
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      preview = svgEl('rect', { x, y, width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y), fill: '#ffffff', 'fill-opacity': .55, stroke: '#159447', 'stroke-width': 6, 'stroke-dasharray': '8 5' });
    } else if (type === 'route') {
      preview = svgEl('line', { x1: start.x, y1: start.y, x2: current.x, y2: current.y, stroke: '#159447', 'stroke-width': 8, 'stroke-linecap': 'round', 'marker-end': 'url(#arrowGreen)', opacity: .7 });
    } else if (type === 'dimension') {
      preview = svgEl('line', { x1: start.x, y1: start.y, x2: current.x, y2: current.y, stroke: '#24313d', 'stroke-width': 1.5, 'marker-start': 'url(#arrowBlack)', 'marker-end': 'url(#arrowBlack)' });
    }
    if (preview) previewLayer.appendChild(preview);
  }

  function onPointerDown(event) {
    stageWrapper.focus();
    if (event.button === 1 || state.tool === 'pan' || (event.button === 0 && event.altKey)) {
      event.preventDefault();
      state.interaction = {
        mode: 'pan',
        clientX: event.clientX,
        clientY: event.clientY,
        cameraX: state.camera.x,
        cameraY: state.camera.y,
      };
      stageWrapper.setPointerCapture(event.pointerId);
      stageWrapper.style.cursor = 'grabbing';
      return;
    }

    if (event.button !== 0) return;
    const point = clientToCanvas(event.clientX, event.clientY);
    els.cursorPosition.textContent = `X: ${formatMeters(point.x)} · Y: ${formatMeters(point.y)}`;

    const entityElement = findEntityElement(event.target);
    const entity = entityElement ? state.entities.find((item) => item.id === entityElement.dataset.id) : null;

    if (state.tool === 'select') {
      if (entity) {
        setSelected(entity.id);
        if (!entity.locked) {
          state.interaction = {
            mode: 'drag',
            id: entity.id,
            start: point,
            original: deepClone(entity),
          };
          stageWrapper.setPointerCapture(event.pointerId);
        }
      } else {
        setSelected(null);
      }
      return;
    }

    if (['door', 'window'].includes(state.tool)) {
      const entityToAdd = defaultEntity(state.tool, point.x, point.y);
      entityToAdd.x = snap(point.x - entityToAdd.w / 2);
      entityToAdd.y = snap(point.y - entityToAdd.h / 2);
      addEntity(entityToAdd);
      setTool('select');
      return;
    }

    if (state.tool === 'text') {
      const text = window.prompt('Texto a inserir:', 'Texto');
      if (text !== null && text.trim()) {
        const entityToAdd = defaultEntity('text', point.x, point.y);
        entityToAdd.text = text.trim();
        entityToAdd.name = text.trim().slice(0, 30);
        addEntity(entityToAdd);
      }
      setTool('select');
      return;
    }

    if (['wall', 'room', 'route', 'dimension'].includes(state.tool)) {
      const start = { x: snap(point.x), y: snap(point.y) };
      state.interaction = { mode: 'draw', type: state.tool, start, current: start };
      createPreview(state.tool, start, start);
      stageWrapper.setPointerCapture(event.pointerId);
    }
  }

  function onPointerMove(event) {
    const point = clientToCanvas(event.clientX, event.clientY);
    els.cursorPosition.textContent = `X: ${formatMeters(point.x)} · Y: ${formatMeters(point.y)}`;
    const interaction = state.interaction;
    if (!interaction) return;

    if (interaction.mode === 'pan') {
      const dx = (event.clientX - interaction.clientX) / state.camera.zoom;
      const dy = (event.clientY - interaction.clientY) / state.camera.zoom;
      state.camera.x = interaction.cameraX - dx;
      state.camera.y = interaction.cameraY - dy;
      applyViewBox();
      return;
    }

    if (interaction.mode === 'drag') {
      const entity = state.entities.find((item) => item.id === interaction.id);
      if (!entity) return;
      const original = deepClone(interaction.original);
      const dx = point.x - interaction.start.x;
      const dy = point.y - interaction.start.y;
      if (original.points) {
        entity.points = original.points.map((p) => ({ x: snap(p.x + dx), y: snap(p.y + dy) }));
      } else {
        entity.x = snap(original.x + dx);
        entity.y = snap(original.y + dy);
      }
      renderAll();
      return;
    }

    if (interaction.mode === 'draw') {
      interaction.current = { x: snap(point.x), y: snap(point.y) };
      createPreview(interaction.type, interaction.start, interaction.current);
    }
  }

  function onPointerUp(event) {
    const interaction = state.interaction;
    if (!interaction) return;
    state.interaction = null;
    try { stageWrapper.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
    stageWrapper.style.cursor = state.tool === 'pan' ? 'grab' : (state.tool === 'select' ? 'default' : 'crosshair');

    if (interaction.mode === 'drag') {
      commitHistory();
      return;
    }

    if (interaction.mode === 'draw') {
      previewLayer.replaceChildren();
      const a = interaction.start;
      const b = interaction.current;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance < 10) return;

      if (interaction.type === 'wall') {
        addEntity({
          id: uid('wall'), type: 'wall', name: 'Parede', points: [a, b],
          stroke: '#24313d', fill: '#24313d', strokeWidth: 12, opacity: 1, rotation: 0, text: '', locked: false,
        });
      } else if (interaction.type === 'route') {
        addEntity({
          id: uid('route'), type: 'route', name: 'Rota de evacuação', points: [a, b],
          stroke: '#159447', fill: '#159447', strokeWidth: 8, opacity: 1, rotation: 0, text: 'Saída', locked: false,
        });
      } else if (interaction.type === 'dimension') {
        addEntity({
          id: uid('dimension'), type: 'dimension', name: 'Cota', points: [a, b],
          stroke: '#24313d', fill: '#24313d', strokeWidth: 1.5, opacity: 1, rotation: 0, text: formatMeters(distance), locked: false,
        });
      } else if (interaction.type === 'room') {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const entity = defaultEntity('room', x, y);
        entity.x = x;
        entity.y = y;
        entity.w = Math.max(20, Math.abs(b.x - a.x));
        entity.h = Math.max(20, Math.abs(b.y - a.y));
        addEntity(entity);
      }
    }
  }

  function scheduleAutosave() {
    clearTimeout(state.autosaveTimer);
    if (!storageEnabled) {
      els.autosaveStatus.textContent = 'Use Guardar para descarregar o projeto';
      return;
    }
    els.autosaveStatus.textContent = 'A guardar…';
    state.autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProject()));
        els.autosaveStatus.textContent = 'Guardado localmente';
      } catch (_) {
        storageEnabled = false;
        els.autosaveStatus.textContent = 'Use Guardar para descarregar o projeto';
      }
    }, 350);
  }

  function serializeProject() {
    return {
      app: 'Aloeworld Safety Plan 360',
      version: APP_VERSION,
      title: state.documentTitle,
      page: deepClone(state.page),
      drawingScale: state.drawingScale,
      showGrid: state.showGrid,
      snap: state.snap,
      entities: deepClone(state.entities),
      savedAt: new Date().toISOString(),
    };
  }

  function loadProject(project, { commit = true, fit = true } = {}) {
    if (!project || !Array.isArray(project.entities)) throw new Error('Ficheiro de projeto inválido.');
    state.documentTitle = project.title || 'Plano de Emergência e Evacuação';
    state.page = project.page || { width: 1123, height: 794 };
    state.drawingScale = Number(project.drawingScale || 50);
    state.showGrid = project.showGrid !== false;
    state.snap = project.snap !== false;
    state.entities = deepClone(project.entities);
    state.selectedId = null;
    els.documentTitle.value = state.documentTitle;
    els.pageWidth.value = state.page.width;
    els.pageHeight.value = state.page.height;
    els.drawingScale.value = String(state.drawingScale);
    els.gridToggle.checked = state.showGrid;
    els.snapToggle.checked = state.snap;
    updatePage();
    renderAll();
    if (fit) requestAnimationFrame(fitPage);
    if (commit) resetHistory();
  }

  function resetHistory() {
    state.history = [];
    state.historyIndex = -1;
    commitHistory();
  }

  function historySnapshot() {
    return JSON.stringify({
      title: state.documentTitle,
      page: state.page,
      drawingScale: state.drawingScale,
      showGrid: state.showGrid,
      snap: state.snap,
      entities: state.entities,
    });
  }

  function commitHistory() {
    const snapshot = historySnapshot();
    if (state.history[state.historyIndex] === snapshot) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    if (state.history.length > 60) state.history.shift();
    state.historyIndex = state.history.length - 1;
    updateHistoryButtons();
  }

  function restoreHistory(index) {
    if (index < 0 || index >= state.history.length) return;
    state.historyIndex = index;
    const snapshot = JSON.parse(state.history[index]);
    loadProject(snapshot, { commit: false, fit: false });
    updateHistoryButtons();
  }

  function undo() { restoreHistory(state.historyIndex - 1); }
  function redo() { restoreHistory(state.historyIndex + 1); }

  function updateHistoryButtons() {
    document.getElementById('undoBtn').disabled = state.historyIndex <= 0;
    document.getElementById('redoBtn').disabled = state.historyIndex >= state.history.length - 1;
  }

  function updatePage() {
    pageBackground.setAttribute('width', state.page.width);
    pageBackground.setAttribute('height', state.page.height);
    gridLayer.setAttribute('width', state.page.width);
    gridLayer.setAttribute('height', state.page.height);
    gridLayer.style.display = state.showGrid ? '' : 'none';
    els.pageWidth.value = state.page.width;
    els.pageHeight.value = state.page.height;
  }

  function setPageFormat(format) {
    const sizes = {
      'a4-landscape': [1123, 794],
      'a4-portrait': [794, 1123],
      'a3-landscape': [1587, 1123],
      'a3-portrait': [1123, 1587],
    };
    if (sizes[format]) {
      [state.page.width, state.page.height] = sizes[format];
      updatePage();
      fitPage();
      commitHistory();
    }
  }

  function newProject() {
    if (state.entities.length && !window.confirm('Criar um novo plano? As alterações não exportadas permanecem apenas na gravação automática do navegador.')) return;
    loadTemplate('blank');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFilename(extension) {
    const base = (state.documentTitle || 'plano-emergencia')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return `${base || 'plano-emergencia'}.${extension}`;
  }

  function saveProjectFile() {
    const data = JSON.stringify(serializeProject(), null, 2);
    downloadBlob(new Blob([data], { type: 'application/json' }), safeFilename('asp360'));
    showToast('Projeto guardado.');
  }

  function exportClone() {
    const clone = canvas.cloneNode(true);
    clone.querySelector('#selectionLayer')?.remove();
    clone.querySelector('#previewLayer')?.remove();
    clone.setAttribute('viewBox', `0 0 ${state.page.width} ${state.page.height}`);
    clone.setAttribute('width', state.page.width);
    clone.setAttribute('height', state.page.height);
    clone.setAttribute('xmlns', SVG_NS);
    return clone;
  }

  function exportSvg() {
    const clone = exportClone();
    const serializer = new XMLSerializer();
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;
    downloadBlob(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), safeFilename('svg'));
    showToast('SVG exportado.');
  }

  function exportPng() {
    const clone = exportClone();
    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(clone);
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const scale = 2;
      const out = document.createElement('canvas');
      out.width = state.page.width * scale;
      out.height = state.page.height * scale;
      const context = out.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, out.width, out.height);
      context.drawImage(image, 0, 0, out.width, out.height);
      out.toBlob((pngBlob) => {
        if (pngBlob) downloadBlob(pngBlob, safeFilename('png'));
        URL.revokeObjectURL(url);
        showToast('PNG exportado em alta resolução.');
      }, 'image/png');
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      showToast('Não foi possível exportar a imagem.');
    };
    image.src = url;
  }

  function exportPdfPrint() {
    const clone = exportClone();
    const serialized = new XMLSerializer().serializeToString(clone);
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      showToast('Permita janelas pop-up para exportar em PDF.');
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(state.documentTitle)}</title><style>@page{size:auto;margin:8mm}html,body{margin:0;background:#fff}svg{width:100%;height:auto;display:block}</style></head><body>${serialized}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
    printWindow.document.close();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2200);
  }

  function centerPoint() {
    const rect = stageWrapper.getBoundingClientRect();
    return clientToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function renderSymbolLibrary(filter = '') {
    els.symbolLibrary.replaceChildren();
    const search = filter.trim().toLowerCase();
    symbols.filter((symbol) => `${symbol.name} ${symbol.group}`.toLowerCase().includes(search)).forEach((symbol) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'symbol-card';
      button.draggable = true;
      button.dataset.symbol = symbol.type;
      const icon = svgEl('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true' });
      icon.appendChild(symbolGraphic(symbol.type, 0, 0, symbol.type === 'exit' ? 64 : 64, 64, symbol.color));
      const name = document.createElement('span');
      name.textContent = symbol.name;
      button.append(icon, name);
      button.addEventListener('click', () => {
        const point = centerPoint();
        addEntity(symbolEntity(symbol.type, point.x, point.y));
        setTool('select');
      });
      button.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', symbol.type);
        event.dataTransfer.effectAllowed = 'copy';
      });
      els.symbolLibrary.appendChild(button);
    });
  }

  function loadImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const point = centerPoint();
      const entity = defaultEntity('image', point.x - 200, point.y - 130);
      entity.src = String(reader.result);
      entity.name = file.name;
      const img = new Image();
      img.onload = () => {
        const maxW = Math.min(650, state.page.width * .75);
        const maxH = Math.min(500, state.page.height * .75);
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        entity.w = Math.max(80, img.width * ratio);
        entity.h = Math.max(60, img.height * ratio);
        entity.x = point.x - entity.w / 2;
        entity.y = point.y - entity.h / 2;
        addEntity(entity);
      };
      img.onerror = () => showToast('Não foi possível ler a imagem.');
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function templateOffice() {
    const entities = [];
    const room = (x, y, w, h, text) => {
      const entity = defaultEntity('room', x, y);
      Object.assign(entity, { x, y, w, h, text, name: text });
      entities.push(entity);
    };
    room(120, 120, 850, 520, '');
    room(120, 120, 280, 220, 'Receção');
    room(400, 120, 280, 220, 'Gabinete 1');
    room(680, 120, 290, 220, 'Gabinete 2');
    room(120, 340, 330, 300, 'Sala de reunião');
    room(450, 340, 250, 300, 'Open space');
    room(700, 340, 270, 300, 'Apoio / arquivo');
    const d1 = defaultEntity('door', 330, 300); Object.assign(d1, { w: 70, h: 70, name: 'Porta interior' }); entities.push(d1);
    const d2 = defaultEntity('door', 930, 560); Object.assign(d2, { w: 80, h: 80, rotation: 90, name: 'Saída principal' }); entities.push(d2);
    const d3 = defaultEntity('door', 80, 520); Object.assign(d3, { w: 80, h: 80, rotation: -90, name: 'Saída alternativa' }); entities.push(d3);
    entities.push(symbolEntity('exit', 930, 620));
    entities.push(symbolEntity('exit', 135, 610));
    entities.push(symbolEntity('extinguisher', 520, 370));
    entities.push(symbolEntity('alarm', 780, 350));
    entities.push(symbolEntity('firstaid', 180, 180));
    entities.push(symbolEntity('youarehere', 590, 540));
    entities.push({ id: uid('route'), type: 'route', name: 'Rota principal', points: [{ x: 585, y: 570 }, { x: 840, y: 570 }, { x: 930, y: 600 }], stroke: '#159447', fill: '#159447', strokeWidth: 8, opacity: 1, rotation: 0, text: 'Saída', locked: false });
    entities.push({ id: uid('route'), type: 'route', name: 'Rota alternativa', points: [{ x: 585, y: 570 }, { x: 300, y: 570 }, { x: 150, y: 580 }], stroke: '#159447', fill: '#159447', strokeWidth: 7, opacity: .7, rotation: 0, text: 'Alternativa', locked: false });
    const title = defaultEntity('text', 120, 60); Object.assign(title, { text: 'PLANO DE EMERGÊNCIA — ESCRITÓRIO', name: 'Título', fontSize: 25, w: 600 }); entities.push(title);
    return entities;
  }

  function templateHome() {
    const entities = [];
    const room = (x, y, w, h, text) => {
      const entity = defaultEntity('room', x, y);
      Object.assign(entity, { x, y, w, h, text, name: text });
      entities.push(entity);
    };
    room(160, 130, 760, 500, '');
    room(160, 130, 260, 220, 'Quarto 1');
    room(420, 130, 250, 220, 'Quarto 2');
    room(670, 130, 250, 220, 'Cozinha');
    room(160, 350, 510, 280, 'Sala');
    room(670, 350, 250, 280, 'Instalação sanitária');
    const exitDoor = defaultEntity('door', 560, 570); Object.assign(exitDoor, { w: 90, h: 90, name: 'Porta de saída' }); entities.push(exitDoor);
    entities.push(symbolEntity('exit', 640, 620));
    entities.push(symbolEntity('smoke', 330, 240));
    entities.push(symbolEntity('smoke', 540, 240));
    entities.push(symbolEntity('extinguisher', 760, 390));
    entities.push(symbolEntity('youarehere', 390, 520));
    entities.push(symbolEntity('assembly', 1010, 520));
    entities.push({ id: uid('route'), type: 'route', name: 'Rota de evacuação', points: [{ x: 420, y: 530 }, { x: 560, y: 530 }, { x: 610, y: 610 }], stroke: '#159447', fill: '#159447', strokeWidth: 8, opacity: 1, rotation: 0, text: 'Saída', locked: false });
    entities.push({ id: uid('route'), type: 'route', name: 'Ponto de encontro', points: [{ x: 660, y: 610 }, { x: 970, y: 540 }], stroke: '#159447', fill: '#159447', strokeWidth: 7, opacity: .85, rotation: 0, text: 'Encontro', locked: false });
    const title = defaultEntity('text', 160, 65); Object.assign(title, { text: 'PLANO DE EVACUAÇÃO — HABITAÇÃO', name: 'Título', fontSize: 25, w: 600 }); entities.push(title);
    return entities;
  }

  function templateWarehouse() {
    const entities = [];
    const outer = defaultEntity('room', 110, 110); Object.assign(outer, { x: 110, y: 110, w: 900, h: 550, text: 'ARMAZÉM', name: 'Armazém', strokeWidth: 10 }); entities.push(outer);
    for (let i = 0; i < 4; i += 1) {
      const rack = defaultEntity('room', 220 + i * 170, 210); Object.assign(rack, { x: 220 + i * 170, y: 210, w: 90, h: 300, text: `Estante ${i + 1}`, name: `Estante ${i + 1}`, strokeWidth: 3, fill: '#e9eef1' }); entities.push(rack);
    }
    const mainExit = defaultEntity('door', 920, 540); Object.assign(mainExit, { w: 100, h: 100, rotation: 90, name: 'Saída principal' }); entities.push(mainExit);
    const altExit = defaultEntity('door', 70, 180); Object.assign(altExit, { w: 90, h: 90, rotation: -90, name: 'Saída alternativa' }); entities.push(altExit);
    entities.push(symbolEntity('exit', 930, 640));
    entities.push(symbolEntity('exit', 115, 180));
    entities.push(symbolEntity('firehose', 850, 170));
    entities.push(symbolEntity('extinguisher', 175, 570));
    entities.push(symbolEntity('extinguisher', 820, 570));
    entities.push(symbolEntity('alarm', 530, 150));
    entities.push(symbolEntity('youarehere', 540, 570));
    entities.push({ id: uid('route'), type: 'route', name: 'Rota principal', points: [{ x: 570, y: 600 }, { x: 800, y: 600 }, { x: 940, y: 610 }], stroke: '#159447', fill: '#159447', strokeWidth: 8, opacity: 1, rotation: 0, text: 'Saída', locked: false });
    entities.push({ id: uid('route'), type: 'route', name: 'Rota alternativa', points: [{ x: 540, y: 570 }, { x: 180, y: 570 }, { x: 135, y: 260 }], stroke: '#159447', fill: '#159447', strokeWidth: 7, opacity: .7, rotation: 0, text: 'Alternativa', locked: false });
    const title = defaultEntity('text', 110, 55); Object.assign(title, { text: 'PLANO DE EMERGÊNCIA — ARMAZÉM', name: 'Título', fontSize: 25, w: 620 }); entities.push(title);
    return entities;
  }

  function openTemplatesDialog() {
    if (typeof els.templatesDialog.showModal === 'function') {
      if (!els.templatesDialog.open) els.templatesDialog.showModal();
    } else {
      els.templatesDialog.setAttribute('open', '');
    }
  }

  function closeTemplatesDialog() {
    if (typeof els.templatesDialog.close === 'function' && els.templatesDialog.open) {
      els.templatesDialog.close();
    } else {
      els.templatesDialog.removeAttribute('open');
    }
  }

  function loadTemplate(name) {
    let entities = [];
    if (name === 'office') entities = templateOffice();
    if (name === 'home') entities = templateHome();
    if (name === 'warehouse') entities = templateWarehouse();
    state.entities = entities;
    state.selectedId = null;
    state.documentTitle = name === 'blank' ? 'Novo plano de emergência' : `Plano de ${name === 'office' ? 'Emergência — Escritório' : name === 'home' ? 'Evacuação — Habitação' : 'Emergência — Armazém'}`;
    els.documentTitle.value = state.documentTitle;
    renderAll();
    resetHistory();
    requestAnimationFrame(fitPage);
    closeTemplatesDialog();
    showToast(name === 'blank' ? 'Novo plano criado.' : 'Modelo carregado.');
  }

  function bindProperties() {
    const commonHandler = () => {
      const entity = selectedEntity();
      if (!entity) return;
      const oldBounds = entityBounds(entity);
      entity.name = els.propName.value;
      entity.rotation = Number(els.propRotation.value || 0);
      entity.stroke = els.propStroke.value;
      entity.fill = els.propFill.value;
      entity.strokeWidth = Number(els.propStrokeWidth.value || 0);
      entity.opacity = Number(els.propOpacity.value || 1);
      entity.text = els.propText.value;
      entity.locked = els.propLocked.checked;

      const x = Number(els.propX.value || oldBounds.x);
      const y = Number(els.propY.value || oldBounds.y);
      const w = Math.max(1, Number(els.propW.value || oldBounds.w));
      const h = Math.max(1, Number(els.propH.value || oldBounds.h));

      if (entity.points) {
        const sx = oldBounds.w ? w / oldBounds.w : 1;
        const sy = oldBounds.h ? h / oldBounds.h : 1;
        entity.points = entity.points.map((p) => ({
          x: x + (p.x - oldBounds.x) * sx,
          y: y + (p.y - oldBounds.y) * sy,
        }));
        if (entity.type === 'dimension' && !els.propText.value.trim()) {
          const [a, b] = entity.points;
          entity.text = formatMeters(Math.hypot(b.x - a.x, b.y - a.y));
        }
      } else {
        entity.x = x;
        entity.y = y;
        entity.w = w;
        entity.h = h;
      }
      renderAll();
    };

    ['propName', 'propX', 'propY', 'propW', 'propH', 'propRotation', 'propStroke', 'propFill', 'propStrokeWidth', 'propOpacity', 'propText', 'propLocked']
      .forEach((id) => {
        const input = document.getElementById(id);
        input.addEventListener('input', commonHandler);
        input.addEventListener('change', () => { commonHandler(); commitHistory(); });
      });
  }

  function bringFront() {
    const index = state.entities.findIndex((entity) => entity.id === state.selectedId);
    if (index < 0) return;
    const [entity] = state.entities.splice(index, 1);
    state.entities.push(entity);
    renderAll();
    commitHistory();
  }

  function sendBack() {
    const index = state.entities.findIndex((entity) => entity.id === state.selectedId);
    if (index < 0) return;
    const [entity] = state.entities.splice(index, 1);
    state.entities.unshift(entity);
    renderAll();
    commitHistory();
  }

  function bindUi() {
    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === button));
        document.querySelectorAll('.tab-content').forEach((content) => content.classList.remove('active'));
        document.getElementById(`${button.dataset.tab}Tab`).classList.add('active');
      });
    });

    document.querySelectorAll('.tool').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));

    stageWrapper.addEventListener('pointerdown', onPointerDown);
    stageWrapper.addEventListener('pointermove', onPointerMove);
    stageWrapper.addEventListener('pointerup', onPointerUp);
    stageWrapper.addEventListener('pointercancel', onPointerUp);
    stageWrapper.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
    }, { passive: false });

    stageWrapper.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
    stageWrapper.addEventListener('drop', (event) => {
      event.preventDefault();
      const symbolType = event.dataTransfer.getData('text/plain');
      if (!symbols.some((symbol) => symbol.type === symbolType)) return;
      const point = clientToCanvas(event.clientX, event.clientY);
      addEntity(symbolEntity(symbolType, point.x, point.y));
      setTool('select');
    });

    document.getElementById('zoomIn').addEventListener('click', () => zoomBy(1.2));
    document.getElementById('zoomOut').addEventListener('click', () => zoomBy(0.83));
    document.getElementById('fitBtn').addEventListener('click', fitPage);

    els.gridToggle.addEventListener('change', () => {
      state.showGrid = els.gridToggle.checked;
      gridLayer.style.display = state.showGrid ? '' : 'none';
      commitHistory();
    });
    els.snapToggle.addEventListener('change', () => {
      state.snap = els.snapToggle.checked;
      commitHistory();
    });
    els.drawingScale.addEventListener('change', () => {
      state.drawingScale = Number(els.drawingScale.value || 50);
      commitHistory();
    });
    els.pageFormat.addEventListener('change', () => setPageFormat(els.pageFormat.value));
    ['pageWidth', 'pageHeight'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        state.page.width = Math.max(200, Number(els.pageWidth.value || 1123));
        state.page.height = Math.max(200, Number(els.pageHeight.value || 794));
        els.pageFormat.value = 'custom';
        updatePage();
        fitPage();
        commitHistory();
      });
    });

    els.documentTitle.addEventListener('input', () => {
      state.documentTitle = els.documentTitle.value;
      scheduleAutosave();
    });
    els.documentTitle.addEventListener('change', commitHistory);

    document.getElementById('newBtn').addEventListener('click', newProject);
    document.getElementById('openBtn').addEventListener('click', () => {
      els.projectFileInput.value = '';
      els.projectFileInput.click();
    });
    document.getElementById('saveBtn').addEventListener('click', saveProjectFile);
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);

    els.projectFileInput.addEventListener('change', () => {
      const file = els.projectFileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          loadProject(JSON.parse(String(reader.result)));
          showToast('Projeto aberto.');
        } catch (error) {
          window.alert(error.message || 'Não foi possível abrir o projeto.');
        }
      };
      reader.readAsText(file);
    });

    els.imageFileInput.addEventListener('change', () => loadImageFile(els.imageFileInput.files?.[0]));

    document.getElementById('templatesBtn').addEventListener('click', openTemplatesDialog);
    document.getElementById('closeTemplates').addEventListener('click', closeTemplatesDialog);
    document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', () => loadTemplate(button.dataset.template)));

    document.getElementById('exportBtn').addEventListener('click', (event) => {
      event.stopPropagation();
      els.exportMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => els.exportMenu.classList.add('hidden'));
    els.exportMenu.addEventListener('click', (event) => {
      const type = event.target.closest('[data-export]')?.dataset.export;
      if (type === 'png') exportPng();
      if (type === 'svg') exportSvg();
      if (type === 'pdf') exportPdfPrint();
    });

    document.getElementById('deleteBtn').addEventListener('click', removeSelected);
    document.getElementById('duplicateBtn').addEventListener('click', duplicateSelected);
    document.getElementById('frontBtn').addEventListener('click', bringFront);
    document.getElementById('backBtn').addEventListener('click', sendBack);
    document.getElementById('closeProps').addEventListener('click', () => setSelected(null));

    els.symbolSearch.addEventListener('input', () => renderSymbolLibrary(els.symbolSearch.value));

    window.addEventListener('resize', applyViewBox);
    window.addEventListener('keydown', (event) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const editing = ['input', 'textarea', 'select'].includes(activeTag);
      if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) {
        event.preventDefault();
        removeSelected();
      }
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
        if (key === 'y') { event.preventDefault(); redo(); }
        if (key === 's') { event.preventDefault(); saveProjectFile(); }
        if (key === 'd' && !editing) { event.preventDefault(); duplicateSelected(); }
      }
      if (!editing && !event.ctrlKey && !event.metaKey) {
        const shortcuts = { v: 'select', h: 'pan', w: 'wall', r: 'room', d: 'door', e: 'route', m: 'dimension', t: 'text' };
        if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
        if (event.key === 'Escape') { state.interaction = null; previewLayer.replaceChildren(); setTool('select'); }
      }
    });
  }

  function restoreAutosave() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        loadProject(JSON.parse(saved), { commit: false, fit: false });
        resetHistory();
        requestAnimationFrame(fitPage);
        return true;
      }
    } catch (_) { storageEnabled = false; }
    return false;
  }

  function init() {
    renderSymbolLibrary();
    bindUi();
    bindProperties();
    updatePage();
    if (!restoreAutosave()) {
      state.entities = templateOffice();
      state.documentTitle = 'Plano de Emergência — Escritório';
      els.documentTitle.value = state.documentTitle;
      renderAll();
      resetHistory();
      requestAnimationFrame(fitPage);
    }
    setTool('select');
    requestAnimationFrame(() => requestAnimationFrame(fitPage));
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        const rect = stageWrapper.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) applyViewBox();
      });
      observer.observe(stageWrapper);
    }
  }

  init();
})();
