const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerBtn");
const registerError = document.getElementById("registerError");

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  registerError.textContent = "";
  registerError.hidden = true;

  registerButton.disabled = true;
  registerButton.setAttribute("aria-busy", "true");

  const formData = new FormData(registerForm);

  const registration = {
    username: String(formData.get("username") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    accountName: String(
      formData.get("accountName") || ""
    ).trim(),
    password: String(formData.get("password") || "")
  };

  try {
    const response = await fetch("/api/register", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(registration)
    });

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || "Could not create account"
      );
    }

    window.location.href = "/login.html";
  } catch (error) {
    registerError.textContent = error.message;
    registerError.hidden = false;

    registerError.focus?.();
  } finally {
    registerButton.disabled = false;
    registerButton.removeAttribute("aria-busy");
  }
});