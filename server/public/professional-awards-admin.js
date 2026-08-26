(function () {
  const list = document.getElementById("awardAdminList");
  const detail = document.getElementById("awardAdminDetail");
  const message = document.getElementById("awardsAdminMessage");
  let awards = [];
  let selectedId = "";

  function setMessage(text, kind = "") {
    message.textContent = text;
    message.className = `content-workspace-status${kind ? ` is-${kind}` : ""}`;
  }

  function selectedAward() {
    return (
      awards.find((award) => String(award._id) === selectedId) || awards[0]
    );
  }

  function createInput(label, name, value = "", type = "text") {
    const wrapper = document.createElement("label");
    wrapper.className = "content-workspace-field";
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    const input = document.createElement("input");
    input.name = name;
    input.type = type;
    input.value = value || "";
    wrapper.append(labelElement, input);
    return wrapper;
  }

  function getRecipientPayload(form) {
    return {
      year: form.elements.year.value,
      name: form.elements.name.value,
      role: form.elements.role.value,
      medallionNumber: form.elements.medallionNumber?.value || "",
      amount: form.elements.amount?.value || "",
      imageUrl: form.elements.imageUrl?.value || "",
      featured: false,
    };
  }

  function renderList() {
    list.replaceChildren();
    awards.forEach((award) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "content-workspace-record";
      button.classList.toggle(
        "is-selected",
        String(award._id) === selectedId,
      );
      button.textContent = award.title;
      button.setAttribute(
        "aria-pressed",
        String(String(award._id) === selectedId),
      );
      button.addEventListener("click", () => {
        selectedId = String(award._id);
        render();
      });
      list.append(button);
    });
  }

  function createRecipientForm(award, recipient = null) {
    const supportsPhoto = [
      "subaltern-of-the-year",
      "member-of-the-year",
    ].includes(award.slug);
    const usesMedallion = award.slug === "colonel-in-chief-commendation";
    const usesAmount = award.slug === "branch-bursary";
    const form = document.createElement("form");
    form.className = "content-workspace-record-form";
    form.append(
      createInput("Year", "year", recipient?.year, "number"),
      createInput(
        "Recipient name and postnominals",
        "name",
        recipient?.name,
      ),
      createInput("Rank, trade, or role", "role", recipient?.role),
    );
    if (usesMedallion) {
      form.append(
        createInput(
          "Medallion number",
          "medallionNumber",
          recipient?.medallionNumber,
        ),
      );
    }
    if (usesAmount) {
      form.append(createInput("Amount ($)", "amount", recipient?.amount));
    }
    if (supportsPhoto) {
      form.append(
        createInput("Photo URL", "imageUrl", recipient?.imageUrl, "url"),
      );
      const photoFile = createInput(
        "Or upload a photo",
        "imageFile",
        "",
        "file",
      );
      photoFile.querySelector("input").accept = "image/*";
      form.append(photoFile);
      const note = document.createElement("p");
      note.textContent =
        "The most recent recipient is automatically shown at the top of the Awards page. A C&E crest is shown when no photo is provided.";
      form.append(note);
    }
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "cms-page-button";
    save.textContent = recipient ? "Save recipient" : "Add recipient";
    form.append(save);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selectedFile = form.elements.imageFile?.files?.[0];
      let imageUrl = form.elements.imageUrl?.value || "";
      if (selectedFile) {
        const upload = new FormData();
        upload.append(
          "image",
          await CMCENUtils.prepareImageUploadFile(selectedFile),
        );
        upload.append("uploadSource", "professionalAwards");
        upload.append("uploadContext", "professional-award-recipient");
        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          headers: CMCENUtils.authHeaders(),
          body: upload,
        });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.url) {
          return setMessage(
            uploadData.error || "Could not upload photo.",
            "error",
          );
        }
        imageUrl = uploadData.url;
      }
      const payload = getRecipientPayload(form);
      payload.imageUrl = imageUrl;
      const response = await fetch(
        recipient
          ? `/api/admin/professional-awards/${award._id}/recipients/${recipient._id}`
          : `/api/admin/professional-awards/${award._id}/recipients`,
        {
          method: recipient ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...CMCENUtils.authHeaders(),
          },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        return setMessage(data.error || "Could not save recipient.", "error");
      }
      setMessage(data.message, "success");
      await load();
    });
    return form;
  }

  function renderAward(award) {
    detail.replaceChildren();
    if (!award) return;
    const heading = document.createElement("h2");
    heading.textContent = award.title;
    const instructions = document.createElement("p");
    instructions.textContent =
      "Add a recipient below, or select a name from the archive to update it.";
    const addHeading = document.createElement("h3");
    addHeading.textContent = "Add recipient";
    const addForm = createRecipientForm(award);
    const recipientsHeading = document.createElement("h3");
    recipientsHeading.textContent = "Recipient archive";
    const recipients = document.createElement("div");
    recipients.className = "content-workspace-list";
    const editHeading = document.createElement("h3");
    editHeading.textContent = "Select a recipient to edit";
    const editor = document.createElement("div");
    (award.recipients || []).forEach((recipient) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "content-workspace-record";
      button.textContent = `${recipient.year} — ${recipient.name}`;
      button.addEventListener("click", () => {
        editHeading.textContent = `Edit ${recipient.name}`;
        editor.replaceChildren(createRecipientForm(award, recipient));
      });
      recipients.append(button);
    });
    detail.append(
      heading,
      instructions,
      addHeading,
      addForm,
      recipientsHeading,
      recipients,
      editHeading,
      editor,
    );
  }

  function render() {
    renderList();
    renderAward(selectedAward());
  }

  async function load() {
    const response = await fetch("/api/admin/professional-awards", {
      headers: CMCENUtils.authHeaders(),
    });
    const data = await response.json();
    if (!response.ok) {
      return setMessage(data.error || "Could not load awards.", "error");
    }
    awards = data.awards || [];
    if (
      !selectedId ||
      !awards.some((award) => String(award._id) === selectedId)
    ) {
      selectedId = String(awards[0]?._id || "");
    }
    render();
  }

  load();
})();
