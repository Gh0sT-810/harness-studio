import base64
from typing import Any


KEY_MAP = {
    "alt": "Alt",
    "arrowdown": "ArrowDown",
    "arrowleft": "ArrowLeft",
    "arrowright": "ArrowRight",
    "arrowup": "ArrowUp",
    "backspace": "Backspace",
    "cmd": "Meta",
    "ctrl": "Control",
    "delete": "Delete",
    "enter": "Enter",
    "esc": "Escape",
    "escape": "Escape",
    "meta": "Meta",
    "return": "Enter",
    "shift": "Shift",
    "space": " ",
    "tab": "Tab",
}


class PlaywrightComputer:
    def __init__(self, page: Any):
        self.page = page

    def get_environment(self) -> str:
        return "browser"

    def get_dimensions(self) -> tuple[int, int]:
        viewport = getattr(self.page, "viewport_size", None) or {}
        return int(viewport.get("width", 1280)), int(viewport.get("height", 800))

    def screenshot(self) -> str:
        data = self.page.screenshot(full_page=True)
        if isinstance(data, str):
            return data.split(",", 1)[1] if data.startswith("data:image/") else data
        return base64.b64encode(data).decode("ascii")

    def normalize_coordinates(self, x: int, y: int, *, source_width: int = 1000, source_height: int = 1000) -> tuple[int, int]:
        width, height = self.get_dimensions()
        return round(x * width / source_width), round(y * height / source_height)

    def click(self, x: int, y: int, button: str = "left") -> None:
        self.page.mouse.click(x, y, button=button, click_count=1)

    def double_click(self, x: int, y: int) -> None:
        self.page.mouse.click(x, y, button="left", click_count=2)

    def type(self, text: str) -> None:
        self.page.keyboard.type(text)

    def keypress(self, keys: list[str]) -> None:
        mapped = [KEY_MAP.get(key.lower(), key.upper() if len(key) == 1 else key) for key in keys]
        self.page.keyboard.press("+".join(mapped))

    def scroll(self, x: int, y: int, scroll_x: int, scroll_y: int) -> None:
        self.page.mouse.move(x, y)
        self.page.mouse.wheel(scroll_x, scroll_y)

    def move(self, x: int, y: int) -> None:
        self.page.mouse.move(x, y)

    def drag(self, path: list[dict[str, int]]) -> None:
        if not path:
            return
        first, *rest = path
        self.page.mouse.move(first["x"], first["y"])
        self.page.mouse.down(button="left")
        for point in rest:
            self.page.mouse.move(point["x"], point["y"])
        self.page.mouse.up(button="left")

    def wait(self, ms: int = 1000) -> None:
        self.page.wait_for_timeout(ms)

    def get_current_url(self) -> str:
        return str(getattr(self.page, "url", ""))
