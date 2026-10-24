(function () {
    try {
        var storedTheme = localStorage.getItem("theme");
        var theme = storedTheme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", theme);
    } catch (_) {
        document.documentElement.setAttribute("data-theme", "light");
    }
})();
