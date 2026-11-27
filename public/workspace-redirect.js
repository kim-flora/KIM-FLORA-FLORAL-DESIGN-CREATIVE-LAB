const tabs = new Set(['#projects', '#composition', '#color-studio']);
location.replace('/' + (tabs.has(location.hash) ? location.hash : ''));
