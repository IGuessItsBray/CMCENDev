(function () {
  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function parseDateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(value || ""));
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);

    return date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
      ? { year, month, day }
      : null;
  }

  function parseTimeParts(value) {
    const match = /^(\d{2}):(\d{2})$/u.exec(String(value || ""));
    if (!match) return null;

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
      ? { hour, minute }
      : null;
  }

  function getDateValue(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function getTimeValue(hour, minute) {
    return `${pad(hour)}:${pad(minute)}`;
  }

  function formatDisplay(dateValue, timeValue, placeholder) {
    const dateParts = parseDateParts(dateValue);
    if (!dateParts) return placeholder;

    const date = new Date(dateParts.year, dateParts.month, dateParts.day);
    const timeParts = parseTimeParts(timeValue) || { hour: 0, minute: 0 };
    const dateLabel = date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeLabel = new Date(
      dateParts.year,
      dateParts.month,
      dateParts.day,
      timeParts.hour,
      timeParts.minute,
    ).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${dateLabel}, ${timeLabel}`;
  }

  function formatDateDisplay(dateValue, placeholder) {
    const dateParts = parseDateParts(dateValue);
    if (!dateParts) return placeholder;

    return new Date(
      dateParts.year,
      dateParts.month,
      dateParts.day,
    ).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function createButton(className, text, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(event);
    });
    return button;
  }

  function createDateTimePicker(options = {}) {
    const name = options.name || "dateTime";
    const includeTime = options.includeTime !== false;
    const placeholder = options.placeholder || "Select date and time";
    const locale = options.locale || document.documentElement.lang || undefined;
    const monthFormatter = new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
    });
    const weekdayFormatter = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    });
    const valueDate = parseDateParts(options.date || "") ? options.date : "";
    const valueTime = parseTimeParts(options.time || "") ? options.time : "";
    const now = new Date();
    let selectedDate = valueDate;
    let selectedTime = valueTime || "00:00";
    let visibleMonth = valueDate
      ? new Date(`${valueDate}T00:00:00`).getMonth()
      : now.getMonth();
    let visibleYear = valueDate
      ? new Date(`${valueDate}T00:00:00`).getFullYear()
      : now.getFullYear();

    const picker = document.createElement("div");
    picker.className = "cmcen-date-time-picker";

    const dateInput = document.createElement("input");
    dateInput.type = "hidden";
    dateInput.name = options.dateName || `${name}Date`;
    dateInput.value = selectedDate;

    const timeInput = document.createElement("input");
    timeInput.type = "hidden";
    timeInput.name = options.timeName || `${name}Time`;
    timeInput.value = selectedTime;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "cmcen-date-time-trigger";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", options.label || placeholder);

    const popover = document.createElement("div");
    popover.className = "cmcen-date-time-popover";

    function emitInput() {
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      timeInput.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof options.onInput === "function") {
        options.onInput({
          date: selectedDate,
          time: includeTime ? selectedTime : "",
          dateInput,
          timeInput,
        });
      }
    }

    function updateTrigger() {
      trigger.textContent = includeTime
        ? formatDisplay(selectedDate, selectedTime, placeholder)
        : formatDateDisplay(selectedDate, placeholder);
      trigger.classList.toggle("is-placeholder", !selectedDate);
    }

    function setOpen(isOpen) {
      if (isOpen) {
        window.dispatchEvent(
          new CustomEvent("cmcen:picker-open", {
            detail: { picker },
          }),
        );
      }
      picker.classList.toggle("is-open", isOpen);
      trigger.setAttribute("aria-expanded", String(isOpen));
      if (!isOpen) return;

      const triggerRect = trigger.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      const left = Math.max(
        12,
        Math.min(triggerRect.left, window.innerWidth - width - 12),
      );
      popover.style.setProperty("--date-popover-left", `${left}px`);
      popover.style.setProperty(
        "--date-popover-top",
        `${triggerRect.bottom + 4}px`,
      );
      popover.style.setProperty("--date-popover-width", `${width}px`);
    }

    function selectDate(dateValue) {
      selectedDate = dateValue;
      dateInput.value = selectedDate;
      updateTrigger();
      renderCalendar();
      emitInput();
    }

    function setTime(nextTime) {
      selectedTime = parseTimeParts(nextTime) ? nextTime : "00:00";
      timeInput.value = selectedTime;
      updateTrigger();
      emitInput();
    }

    function setValue(nextValue = {}) {
      const nextDate = parseDateParts(nextValue.date || "")
        ? nextValue.date
        : "";
      const nextTime = parseTimeParts(nextValue.time || "")
        ? nextValue.time
        : "00:00";

      selectedDate = nextDate;
      selectedTime = nextTime;
      dateInput.value = selectedDate;
      timeInput.value = selectedTime;

      if (selectedDate) {
        const date = new Date(`${selectedDate}T00:00:00`);

        visibleMonth = date.getMonth();
        visibleYear = date.getFullYear();
      }

      updateTrigger();
      renderCalendar();

      if (nextValue.emit === true) {
        emitInput();
      }
    }

    function renderCalendar() {
      popover.replaceChildren();

      const header = document.createElement("div");
      header.className = "cmcen-date-time-header";

      const previous = createButton("cmcen-date-time-nav", "<", () => {
        visibleMonth -= 1;
        if (visibleMonth < 0) {
          visibleMonth = 11;
          visibleYear -= 1;
        }
        renderCalendar();
      });

      const title = document.createElement("strong");
      title.textContent = monthFormatter.format(
        new Date(visibleYear, visibleMonth, 1),
      );

      const next = createButton("cmcen-date-time-nav", ">", () => {
        visibleMonth += 1;
        if (visibleMonth > 11) {
          visibleMonth = 0;
          visibleYear += 1;
        }
        renderCalendar();
      });

      header.append(previous, title, next);

      const grid = document.createElement("div");
      grid.className = "cmcen-date-time-grid";
      Array.from({ length: 7 }, (_, day) =>
        weekdayFormatter.format(new Date(Date.UTC(2023, 0, day + 1))),
      ).forEach((day) => {
        const label = document.createElement("span");
        label.className = "cmcen-date-time-weekday";
        label.textContent = day;
        grid.append(label);
      });

      const firstDay = new Date(visibleYear, visibleMonth, 1).getDay();
      const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0).getDate();
      for (let index = 0; index < firstDay; index += 1) {
        const blank = document.createElement("span");
        blank.className = "cmcen-date-time-blank";
        grid.append(blank);
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(visibleYear, visibleMonth, day);
        const dateValue = getDateValue(date);
        const button = createButton("cmcen-date-time-day", String(day), () =>
          selectDate(dateValue),
        );
        button.classList.toggle("is-selected", dateValue === selectedDate);
        button.classList.toggle("is-today", dateValue === getDateValue(now));
        grid.append(button);
      }

      if (includeTime) {
        const timeRow = document.createElement("div");
        timeRow.className = "cmcen-date-time-time-row";

        const timeLabel = document.createElement("span");
        timeLabel.textContent = options.timeLabel || "Time";

        const nativeTime = document.createElement("input");
        nativeTime.type = "time";
        nativeTime.value = selectedTime;
        nativeTime.addEventListener("input", () => setTime(nativeTime.value));

        timeRow.append(timeLabel, nativeTime);
        popover.append(timeRow);
      }

      const actions = document.createElement("div");
      actions.className = "cmcen-date-time-actions";
      actions.append(
        createButton(
          "cmcen-date-time-action",
          options.clearLabel || "Clear",
          () => {
            selectedDate = "";
            selectedTime = "00:00";
            dateInput.value = "";
            timeInput.value = selectedTime;
            updateTrigger();
            renderCalendar();
            emitInput();
          },
        ),
        createButton(
          "cmcen-date-time-action is-primary",
          options.doneLabel || "Done",
          () => setOpen(false),
        ),
      );

      popover.prepend(header, grid);
      popover.append(actions);
    }

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(!picker.classList.contains("is-open"));
    });

    const stopPickerPropagation = (event) => event.stopPropagation();
    const closeOnDocumentClick = () => setOpen(false);
    const closeWhenAnotherPickerOpens = (event) => {
      if (event.detail?.picker !== picker) {
        setOpen(false);
      }
    };
    const positionOnResize = () => {
      if (picker.classList.contains("is-open")) setOpen(true);
    };
    const positionOnScroll = () => {
      if (picker.classList.contains("is-open")) setOpen(true);
    };

    picker.addEventListener("click", stopPickerPropagation);
    document.addEventListener("click", closeOnDocumentClick);
    window.addEventListener("cmcen:picker-open", closeWhenAnotherPickerOpens);
    window.addEventListener("resize", positionOnResize);
    window.addEventListener("scroll", positionOnScroll, true);

    updateTrigger();
    renderCalendar();
    picker.append(dateInput);
    if (includeTime) {
      picker.append(timeInput);
    }
    picker.append(trigger, popover);
    picker.setValue = setValue;
    picker.getValue = () => ({
      date: selectedDate,
      time: includeTime ? selectedTime : "",
    });
    picker.destroy = () => {
      document.removeEventListener("click", closeOnDocumentClick);
      window.removeEventListener(
        "cmcen:picker-open",
        closeWhenAnotherPickerOpens,
      );
      window.removeEventListener("resize", positionOnResize);
      window.removeEventListener("scroll", positionOnScroll, true);
      picker.removeEventListener("click", stopPickerPropagation);
      picker.remove();
    };

    return picker;
  }

  const enhancedDatePickers = new WeakMap();

  function enhanceDateInput(input, options = {}) {
    if (!input || input.dataset.cmcenDatePickerEnhanced === "true") return null;

    const name = input.name || input.id || "date";
    const picker = createDateTimePicker({
      name,
      dateName: name,
      date: input.value,
      includeTime: false,
      placeholder: options.placeholder || input.placeholder || "Select date",
      label: options.label || input.getAttribute("aria-label") || "Select date",
      onInput: ({ date }) => {
        input.value = date;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      },
    });

    input.dataset.cmcenDatePickerEnhanced = "true";
    input.dataset.originalName = input.name || "";
    input.name = "";
    input.classList.add("cmcen-native-date-input-hidden");
    input.insertAdjacentElement("afterend", picker);

    // Labels must target the custom trigger instead of the visually hidden
    // native input. Otherwise Safari opens its unstyled built-in calendar
    // whenever a user clicks a date label.
    const trigger = picker.querySelector(".cmcen-date-time-trigger");
    if (input.id && trigger) {
      trigger.id = `${input.id}PickerTrigger`;
      document
        .querySelectorAll("label[for]")
        .forEach((label) => {
          if (label.htmlFor !== input.id) return;

          label.htmlFor = trigger.id;
          label.addEventListener("click", (event) => {
            event.preventDefault();
            trigger.click();
          });
        });
    }

    enhancedDatePickers.set(input, picker);
    return picker;
  }

  function refreshDateInput(input) {
    const picker = enhancedDatePickers.get(input);

    if (!picker || typeof picker.setValue !== "function") {
      return;
    }

    picker.setValue({ date: input.value });
  }

  function enhanceAllDateInputs(root = document) {
    root
      .querySelectorAll('input[type="date"]:not([data-cmcen-picker="native"])')
      .forEach((input) => enhanceDateInput(input));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => enhanceAllDateInputs());
  } else {
    enhanceAllDateInputs();
  }

  window.CMCENDateTimePicker = {
    create: createDateTimePicker,
    enhanceDateInput,
    enhanceAllDateInputs,
    refreshDateInput,
  };
})();
