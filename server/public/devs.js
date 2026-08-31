(() => {
  "use strict";

  const changelogContent = document.getElementById("changelogContent");

  if (!changelogContent) return;

  function parseChangelog(markdown) {
    const releases = [];
    let release;
    let section;

    markdown.split(/\r?\n/u).forEach((line) => {
      const releaseMatch = line.match(/^## \[(.+?)\] - (.+)$/u);
      const sectionMatch = line.match(/^### (.+)$/u);
      const changeMatch = line.match(/^- (.+)$/u);

      if (releaseMatch) {
        release = {
          version: releaseMatch[1],
          date: releaseMatch[2],
          sections: [],
        };
        releases.push(release);
        section = undefined;
      } else if (release && sectionMatch) {
        section = { title: sectionMatch[1], changes: [], notes: [] };
        release.sections.push(section);
      } else if (release && section && changeMatch) {
        section.changes.push(changeMatch[1]);
      } else if (release && section && line.trim()) {
        section.notes.push(line.trim());
      }
    });

    return releases;
  }

  function renderChangelog(releases) {
    changelogContent.replaceChildren();

    if (!releases.length) {
      changelogContent.textContent = "No changelog entries are available yet.";
      return;
    }

    const releaseList = document.createElement("div");
    releaseList.className = "developers-changelog-list";

    releases.forEach((release, index) => {
      const releaseDetails = document.createElement("details");
      releaseDetails.className = "developers-changelog-release";
      releaseDetails.open = index === 0;

      const summary = document.createElement("summary");
      const version = document.createElement("span");
      version.className = "developers-changelog-version";
      version.textContent = release.version;
      const date = document.createElement("span");
      date.className = "developers-changelog-date";
      date.textContent = release.date;
      summary.append(version, date);
      releaseDetails.append(summary);

      const sections = document.createElement("div");
      sections.className = "developers-changelog-release-content";
      release.sections.forEach((releaseSection) => {
        const heading = document.createElement("h3");
        heading.textContent = releaseSection.title;
        sections.append(heading);

        releaseSection.notes.forEach((note) => {
          const paragraph = document.createElement("p");
          paragraph.textContent = note;
          sections.append(paragraph);
        });

        if (releaseSection.changes.length) {
          const changes = document.createElement("ul");
          releaseSection.changes.forEach((change) => {
            const item = document.createElement("li");
            item.textContent = change;
            changes.append(item);
          });
          sections.append(changes);
        }
      });

      releaseDetails.append(sections);
      releaseList.append(releaseDetails);
    });

    changelogContent.append(releaseList);
  }

  fetch("/changelog.md")
    .then((response) => {
      if (!response.ok)
        throw new Error(`Unable to load changelog: ${response.status}`);
      return response.text();
    })
    .then(parseChangelog)
    .then(renderChangelog)
    .catch(() => {
      changelogContent.textContent = "The changelog is unavailable right now.";
    });
})();
