    // ==================== MODULE 6: PROJECT ARCHIVE ====================
    function saveFullProject() {
      state.projectName = document.getElementById('projNameInput').value.trim() || 'Dự án Kim Flora';
      state.projectClient = document.getElementById('projClientInput').value.trim();
      state.projectBrief = document.getElementById('projBriefInput').value.trim();
      document.getElementById('activeProjectName').textContent = 'Dự án: ' + state.projectName;

      const project = {
        id: 'prj-' + crypto.randomUUID(),
        name: state.projectName,
        client: state.projectClient,
        brief: state.projectBrief,
        updatedAt: new Date().toLocaleString('vi-VN'),
        palette: JSON.parse(JSON.stringify(state.palette)),
        recipe: JSON.parse(JSON.stringify(state.recipe)),
        compAnnotations: structuredClone(state.compAnnotations)
      };
      state.savedProjects.unshift(project);
      try {
        persist();
      } catch {
        state.savedProjects.shift();
        return;
      }
      renderProjectsArchive();
      showToast('Đã lưu dự án vào kho lưu trữ!', 'success');
    }

    document.getElementById('btnQuickSaveProject').onclick = saveFullProject;
    document.getElementById('btnSaveFullProject').onclick = saveFullProject;

    function renderWorkspaceProjectLinks() {
      const list = document.getElementById('workspaceProjectLinks');
      list.replaceChildren();
      try {
        const projects = JSON.parse(localStorage.getItem('kim-flora-lab-projects-v1') ?? '[]');
        if (!Array.isArray(projects)) throw new Error();
        for (const project of projects) {
          if (typeof project?.id !== 'string' || typeof project.title !== 'string') continue;
          const row = document.createElement('li');
          const details = document.createElement('details');
          const title = document.createElement('summary');
          title.textContent = project.title;
          details.append(title);
          for (const value of [project.occasion, project.notes, project.materials, Array.isArray(project.colors) ? project.colors.join(', ') : '']) {
            if (typeof value !== 'string' || !value) continue;
            const text = document.createElement('p');
            text.className = 'whitespace-pre-wrap';
            text.textContent = value;
            details.append(text);
          }
          row.append(details);
          list.append(row);
        }
      } catch {
        list.append(document.createElement('li'));
        list.lastChild.textContent = 'Chưa đọc được kho Dự án hoa trên trình duyệt này.';
      }
    }

    window.addEventListener('storage', event => {
      if (event.key === 'kim-flora-lab-projects-v1' || event.key === null) renderWorkspaceProjectLinks();
    });

    function renderProjectsArchive() {
      renderWorkspaceProjectLinks();
      document.getElementById('activeProjectName').textContent = 'Dự án: ' + state.projectName;
      document.getElementById('projNameInput').value = state.projectName;
      document.getElementById('projClientInput').value = state.projectClient;
      document.getElementById('projBriefInput').value = state.projectBrief;

      const pGrid = document.getElementById('savedProjectsGrid');
      pGrid.innerHTML = state.savedProjects.length ? state.savedProjects.map((p, idx) => `
        <div class="p-3 rounded-xl bg-[#F7F4EF] border border-[#E4DFD5] space-y-2">
          <div class="flex justify-between items-start">
            <div>
              <div class="font-semibold text-xs">${p.name}</div>
              <div class="text-[11px] text-[#5F6B64]">${p.client || 'Nội bộ'} · ${p.updatedAt}</div>
            </div>
            <button data-idx="${idx}" class="prj-load px-2 py-1 rounded bg-[#1A2621] text-white text-[11px]">Mở</button>
          </div>
          <div class="flex h-4 rounded overflow-hidden border border-black/10">${(p.palette||[]).map(c => `<div class="flex-1" style="background:${c.hex}"></div>`).join('')}</div>
        </div>
      `).join('') : '<p class="text-xs text-[#5F6B64]">Chưa có dự án lưu bằng nút “Lưu Dự Án” của Studio.</p>';

      pGrid.querySelectorAll('.prj-load').forEach(b => {
        b.onclick = () => {
          const p = state.savedProjects[+b.dataset.idx];
          if (!p) return;
          state.projectName = p.name; state.projectClient = p.client; state.projectBrief = p.brief;
          state.palette = structuredClone(p.palette ?? state.palette);
          state.recipe = structuredClone(p.recipe ?? state.recipe);
          state.compAnnotations = structuredClone(p.compAnnotations ?? []);
          renderProjectsArchive();
          renderColorStudio(); renderRecipe(); renderCompCanvas();
          showToast(`Đã nạp dự án "${p.name}"!`, 'success');
        };
      });

      const crGrid = document.getElementById('savedColorRecipesGrid');
      crGrid.innerHTML = state.savedColorRecipes.length ? state.savedColorRecipes.map((cr, idx) => `
        <div class="p-3 rounded-xl bg-[#F7F4EF] border border-[#E4DFD5] space-y-2">
          <div class="flex justify-between items-center">
            <strong class="text-xs">${cr.name}</strong>
            <button data-idx="${idx}" class="cr-load text-[11px] text-[#A65A42] font-semibold hover:underline">Áp dụng</button>
          </div>
          ${cr.image ? `<img src="${cr.image}" class="w-full h-auto max-h-44 object-contain bg-white rounded-lg" />` : ''}
          <div class="flex h-5 rounded overflow-hidden">${cr.palette.map(c => `<div class="flex-1" style="background:${c.hex}" title="${c.hex} (${c.ratio}%)"></div>`).join('')}</div>
        </div>
      `).join('') : '<p class="text-xs text-[#5F6B64]">Chưa có công thức màu riêng nào được lưu.</p>';

      crGrid.querySelectorAll('.cr-load').forEach(b => {
        b.onclick = () => {
          const cr = state.savedColorRecipes[+b.dataset.idx];
          if (!cr) return;
          state.palette = JSON.parse(JSON.stringify(cr.palette));
          if (cr.image) loadImageToColorStudio(cr.image);
          renderColorStudio();
          document.querySelector('[data-tab="color"]').click();
        };
      });
    }

    document.getElementById('btnBackupAllJson').onclick = () => {
      downloadFile('kim_flora_backup.json', JSON.stringify(state, null, 2), 'application/json');
      showToast('Đã xuất file sao lưu JSON!', 'success');
    };
    document.getElementById('btnRestoreJson').onclick = () => document.getElementById('restoreJsonInput').click();
    document.getElementById('restoreJsonInput').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          state = Object.assign({}, DEFAULT_STATE, parsed);
          persist();
          renderColorStudio(); renderInventory(); renderRecipe(); renderProjectsArchive();
          showToast('Khôi phục dữ liệu thành công!', 'success');
        } catch (err) { showToast('File JSON không hợp lệ.', 'error'); }
      };
      r.readAsText(f);
    };

