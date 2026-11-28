    // ==================== MODULE 6: PROJECT ARCHIVE ====================
    const projectElement = id => document.getElementById(id);
    const projectSearch = projectElement('projectSearch');
    const projectSourceFilter = projectElement('projectSourceFilter');
    let projectFormValues;

    function saveFullProject() {
      const previous = state;
      const name = projectElement('projNameInput').value.trim() || 'Dự án Kim Flora';
      const client = projectElement('projClientInput').value.trim();
      const brief = projectElement('projBriefInput').value.trim();
      const project = {
        id: 'prj-' + crypto.randomUUID(),
        name, client, brief,
        updatedAt: new Date().toLocaleString('vi-VN'),
        palette: structuredClone(state.palette),
        recipe: structuredClone(state.recipe),
        compAnnotations: structuredClone(state.compAnnotations)
      };
      state = {
        ...state, projectName: name, projectClient: client, projectBrief: brief,
        savedProjects: [project, ...state.savedProjects]
      };
      try {
        persist();
      } catch {
        state = previous;
        return;
      }
      projectSearch.value = '';
      projectSourceFilter.value = 'all';
      renderProjectsArchive();
      showToast('Đã lưu phiên bản dự án.', 'success');
    }

    projectElement('btnQuickSaveProject').onclick = saveFullProject;
    projectElement('btnSaveFullProject').onclick = saveFullProject;

    function projectNode(tag, text, className) {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      if (className) node.className = className;
      return node;
    }

    function describeProject(record, legacy) {
      return {
        record, legacy,
        name: legacy ? record.title : record.name || 'Dự án chưa đặt tên',
        client: legacy ? record.occasion : record.client,
        date: record.updatedAt || '',
        note: legacy ? record.notes : record.brief,
        materials: legacy ? record.materials : '',
        palette: legacy ? record.colors : (Array.isArray(record.palette) ? record.palette.map(color => color?.hex) : [])
      };
    }

    function viewProjectDetails(project) {
      projectElement('projectDetailsTitle').textContent = project.name;
      projectElement('projectDetailsMeta').textContent = [project.client, project.date].filter(Boolean).join(' · ');
      const fields = projectElement('projectDetailsFields');
      fields.replaceChildren();
      for (const [label, value] of [
        ['Ghi chú', project.note],
        ['Vật liệu', project.materials],
        ['Màu sắc', Array.isArray(project.palette) && project.palette.join(' · ')],
        ['Công thức', project.record.recipe?.name]
      ]) {
        if (typeof value !== 'string' || !value.trim()) continue;
        fields.append(projectNode('dt', label), projectNode('dd', value));
      }
      if (!fields.childElementCount) fields.append(projectNode('dt', 'Hồ sơ chưa có ghi chú chi tiết.'));
      projectElement('projectDetails').showModal();
    }

    function openSavedProject(project) {
      const {record} = project;
      state.projectName = project.name;
      state.projectClient = project.client ?? '';
      state.projectBrief = project.note ?? '';
      state.palette = structuredClone(record.palette ?? state.palette);
      state.recipe = structuredClone(applyDefaults(DEFAULT_STATE.recipe, record.recipe ?? state.recipe));
      state.compAnnotations = structuredClone(record.compAnnotations ?? []);
      projectFormValues = undefined;
      renderProjectsArchive();
      renderColorStudio();
      renderRecipe();
      renderCompCanvas();
      showToast('Đã mở dự án “' + project.name + '”.', 'success');
    }

    function projectSearchText(text) {
      return String(text ?? '').toLocaleLowerCase('vi').normalize('NFD')
        .replace(/\p{M}/gu, '').replace(/đ/g, 'd').trim();
    }

    function renderProjectList() {
      const list = projectElement('savedProjectsGrid');
      const notice = projectElement('projectListMessage');
      list.replaceChildren();
      const projects = (state.savedProjects ?? []).filter(Boolean).map(record => describeProject(record, false));
      let legacyError = false;
      try {
        const legacy = JSON.parse(localStorage.getItem('kim-flora-lab-projects-v1') ?? '[]');
        if (!Array.isArray(legacy)) throw new Error();
        for (const record of legacy) {
          if (typeof record?.id === 'string' && typeof record.title === 'string') projects.push(describeProject(record, true));
        }
      } catch {
        legacyError = true;
      }
      const terms = projectSearchText(projectSearch.value).split(/\s+/).filter(Boolean);
      const source = projectSourceFilter.value;
      const results = projects.filter(project => {
        if (source !== 'all' && project.legacy !== (source === 'legacy')) return false;
        const text = projectSearchText([project.name, project.client, project.note, project.materials].join(' '));
        return terms.every(term => text.includes(term));
      });
      projectElement('projectResultCount').textContent = results.length + ' hồ sơ';
      notice.textContent = legacyError ? 'Chưa đọc được hồ sơ từ kho cũ.'
        : projects.length ? 'Không tìm thấy hồ sơ phù hợp.' : 'Chưa có hồ sơ. Lưu phiên bản đầu tiên từ dự án đang làm.';
      notice.hidden = !legacyError && results.length > 0;
      for (const project of results) {
        const row = projectNode('li', '', 'project-record');
        const content = projectNode('div');
        const meta = [project.client, project.date, project.legacy && 'Kho cũ'].filter(Boolean).join(' · ');
        content.append(projectNode('h4', project.name, 'project-record-title'));
        if (meta) content.append(projectNode('p', meta, 'project-record-meta'));
        const colors = Array.isArray(project.palette)
          ? project.palette.filter(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 10) : [];
        if (colors.length) {
          const swatches = projectNode('div', '', 'project-swatches');
          swatches.setAttribute('aria-hidden', 'true');
          for (const color of colors) {
            const swatch = projectNode('span');
            swatch.style.backgroundColor = color;
            swatches.append(swatch);
          }
          content.append(swatches);
        }
        const actions = projectNode('div', '', 'project-record-actions');
        const details = projectNode('button', 'Chi tiết', 'project-secondary');
        details.type = 'button';
        details.setAttribute('aria-label', 'Chi tiết ' + project.name);
        details.onclick = () => viewProjectDetails(project);
        actions.append(details);
        if (!project.legacy) {
          const open = projectNode('button', 'Mở dự án', 'project-primary');
          open.type = 'button';
          open.setAttribute('aria-label', 'Mở dự án ' + project.name);
          open.onclick = () => openSavedProject(project);
          actions.append(open);
        }
        row.append(content, actions);
        list.append(row);
      }
    }

    function renderProjectsArchive() {
      projectElement('activeProjectName').textContent = 'Dự án: ' + state.projectName;
      const values = [state.projectName, state.projectClient, state.projectBrief];
      if (!projectFormValues || values.some((value, index) => value !== projectFormValues[index])) {
        ['projNameInput', 'projClientInput', 'projBriefInput'].forEach((id, index) => {
          projectElement(id).value = values[index] ?? '';
        });
        projectFormValues = values;
      }
      renderProjectList();
      renderApprovalLibrary();
    }

    projectSearch.oninput = renderProjectList;
    projectSourceFilter.onchange = renderProjectList;
    window.addEventListener('storage', event => {
      if (event.key === 'kim-flora-lab-projects-v1' || event.key === null) renderProjectList();
    });

    function closeProjectDataMenu() {
      projectElement('openProjectBackups').closest('details').open = false;
    }

    projectElement('openProjectBackups').onclick = () => {
      closeProjectDataMenu();
      projectElement('openContentBackups').click();
    };
    projectElement('btnBackupAllJson').onclick = () => {
      closeProjectDataMenu();
      downloadFile('kim_flora_backup.json', JSON.stringify(state, null, 2), 'application/json');
      showToast('Đã tải bản sao Studio.', 'success');
    };
    projectElement('btnRestoreJson').onclick = () => {
      closeProjectDataMenu();
      projectElement('restoreJsonInput').click();
    };
    projectElement('restoreJsonInput').onchange = async event => {
      const input = event.currentTarget;
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
        const restored = applyDefaults(DEFAULT_STATE, parsed);
        if (![restored.savedProjects, restored.savedColorRecipes, restored.palette, restored.inventory].every(Array.isArray)) throw new Error();
        const previous = state;
        state = restored;
        try {
          persist();
        } catch {
          state = previous;
          return;
        }
        projectFormValues = undefined;
        renderColorStudio();
        renderInventory();
        renderRecipe();
        renderProjectsArchive();
        showToast('Đã khôi phục dữ liệu Studio.', 'success');
      } catch {
        showToast('Không đọc được bản sao Studio từ tệp này.', 'error');
      }
    };

