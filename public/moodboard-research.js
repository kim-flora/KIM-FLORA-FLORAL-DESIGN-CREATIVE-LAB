import { mountEditor } from './floral-editor.js';

// The Moodboard tab is the photo editor. Existing stored data is not deleted.
export function mount(host) {
  mountEditor(host);
}
