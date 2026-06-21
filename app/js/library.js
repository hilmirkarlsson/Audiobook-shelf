function progressFor(book, progressMap) {
  const p = progressMap[book.id];
  if (!p) return { pct: 0, status: 'not-started' };
  const pct = book.durationSec ? Math.min(100, (p.positionSec / book.durationSec) * 100) : 0;
  return { pct, status: p.status || 'in-progress' };
}

function matchesFilter(book, progressMap, filter) {
  if (filter === 'all') return true;
  const { status } = progressFor(book, progressMap);
  return status === filter;
}

function matchesSearch(book, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return book.title.toLowerCase().includes(q) || book.author.toLowerCase().includes(q);
}

function sortBooks(books, progressMap, sortBy) {
  const sorted = [...books];
  switch (sortBy) {
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'author':
      sorted.sort((a, b) => a.author.localeCompare(b.author));
      break;
    case 'recent':
      sorted.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
      break;
    case 'progress': {
      const order = { 'in-progress': 0, 'not-started': 1, finished: 2 };
      sorted.sort((a, b) => {
        const pa = progressFor(a, progressMap);
        const pb = progressFor(b, progressMap);
        return (order[pa.status] ?? 1) - (order[pb.status] ?? 1);
      });
      break;
    }
  }
  return sorted;
}

export function renderLibrary({ container, books, progressMap, state, onSelect }) {
  container.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'library-toolbar';

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search title or author';
  search.value = state.query;
  search.className = 'search-input';
  search.addEventListener('input', () => {
    state.query = search.value;
    renderLibrary({ container, books, progressMap, state, onSelect });
  });

  const sortSelect = document.createElement('select');
  sortSelect.innerHTML = `
    <option value="recent">Recently added</option>
    <option value="title">Title</option>
    <option value="author">Author</option>
    <option value="progress">Progress</option>
  `;
  sortSelect.value = state.sortBy;
  sortSelect.addEventListener('change', () => {
    state.sortBy = sortSelect.value;
    renderLibrary({ container, books, progressMap, state, onSelect });
  });

  const filterSelect = document.createElement('select');
  filterSelect.innerHTML = `
    <option value="all">All</option>
    <option value="in-progress">In progress</option>
    <option value="finished">Finished</option>
    <option value="not-started">Not started</option>
  `;
  filterSelect.value = state.filter;
  filterSelect.addEventListener('change', () => {
    state.filter = filterSelect.value;
    renderLibrary({ container, books, progressMap, state, onSelect });
  });

  toolbar.append(search, sortSelect, filterSelect);
  container.appendChild(toolbar);

  const grid = document.createElement('div');
  grid.className = 'library-grid';

  const filtered = books
    .filter((b) => matchesSearch(b, state.query))
    .filter((b) => matchesFilter(b, progressMap, state.filter));
  const sorted = sortBooks(filtered, progressMap, state.sortBy);

  if (sorted.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = books.length === 0
      ? 'No audiobooks yet. Use the ingestion script to add some.'
      : 'No books match your search/filter.';
    container.appendChild(empty);
    return;
  }

  for (const book of sorted) {
    const { pct, status } = progressFor(book, progressMap);
    const card = document.createElement('button');
    card.className = 'book-card';
    card.addEventListener('click', () => onSelect(book));

    const cover = document.createElement('div');
    cover.className = 'book-cover';
    if (book.coverUrl) {
      cover.style.backgroundImage = `url(${book.coverUrl})`;
    } else {
      cover.textContent = book.title.slice(0, 1);
    }

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    if (status === 'finished') bar.classList.add('finished');
    cover.appendChild(bar);

    const title = document.createElement('div');
    title.className = 'book-title';
    title.textContent = book.title;

    const author = document.createElement('div');
    author.className = 'book-author';
    author.textContent = book.author;

    card.append(cover, title, author);
    grid.appendChild(card);
  }

  container.appendChild(grid);
}
