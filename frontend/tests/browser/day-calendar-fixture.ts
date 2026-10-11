export function createDayCalendarFixture() {
  const container = document.createElement("section");
  const label = document.createElement("label");
  label.textContent = "입사일";
  const target = document.createElement("input");
  target.type = "text";
  target.readOnly = true;
  target.className = "hasDatepicker";
  target.placeholder = "YYYY-MM-DD";
  target.maxLength = 10;
  label.append(target);
  const popup = document.createElement("div");
  popup.className = "ui-datepicker";
  popup.style.display = "none";
  container.append(label, popup);
  document.body.append(container);
  let year = 2020;
  let month = 6;

  function render() {
    const yearSelect = document.createElement("select");
    yearSelect.className = "ui-datepicker-year";
    for (const value of [2020, 2024, 2026]) {
      yearSelect.add(new Option(String(value), String(value)));
    }
    yearSelect.value = String(year);
    const monthSelect = document.createElement("select");
    monthSelect.className = "ui-datepicker-month";
    for (let value = 0; value < 12; value++) {
      monthSelect.add(new Option(`${value + 1}월`, String(value)));
    }
    monthSelect.value = String(month - 1);
    yearSelect.addEventListener("change", () => {
      year = Number(yearSelect.value);
      render();
    });
    monthSelect.addEventListener("change", () => {
      month = Number(monthSelect.value) + 1;
      render();
    });

    const table = document.createElement("table");
    table.className = "ui-datepicker-calendar";
    const row = table.insertRow();
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= days; day++) {
      const cell = row.insertCell();
      cell.dataset.year = String(year);
      cell.dataset.month = String(month - 1);
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = String(day);
      link.dataset.date = String(day);
      link.addEventListener("click", (event) => {
        event.preventDefault();
        target.value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        target.dispatchEvent(new Event("change", { bubbles: true }));
        popup.style.display = "none";
      });
      cell.append(link);
    }
    popup.replaceChildren(yearSelect, monthSelect, table);
    popup.dispatchEvent(new Event("fixture-rendered"));
  }

  target.addEventListener("focus", () => {
    render();
    popup.style.display = "block";
  });
  return { container, target, popup };
}
