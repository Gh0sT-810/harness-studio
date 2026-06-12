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
        self._cursor: tuple[int, int] | None = None

    def get_environment(self) -> str:
        return "browser"

    def get_dimensions(self) -> tuple[int, int]:
        viewport = getattr(self.page, "viewport_size", None) or {}
        return int(viewport.get("width", 1280)), int(viewport.get("height", 800))

    def get_cursor_position(self) -> tuple[int, int] | None:
        return self._cursor

    def get_capture_metadata(self, *, full_page: bool = False) -> dict[str, Any]:
        width, height = self.get_dimensions()
        cursor: dict[str, Any] = {"coordinateBasis": "viewport", "visible": False}
        if self._cursor is not None:
            cursor.update({"x": self._cursor[0], "y": self._cursor[1], "visible": True})
        return {
            "viewport": {"width": width, "height": height},
            "screenshot": {
                "fullPage": full_page,
                "scrollX": self._evaluate_number("() => window.scrollX", 0),
                "scrollY": self._evaluate_number("() => window.scrollY", 0),
                "deviceScaleFactor": self._evaluate_number("() => window.devicePixelRatio", 1),
            },
            "cursor": cursor,
        }

    def screenshot(self) -> str:
        # Viewport-only capture: the stored frame must be exactly what the
        # screen showed ("ditto"), and it is also what provider computer-use
        # tools expect for their configured display size.
        data = self.page.screenshot(full_page=False)
        if isinstance(data, str):
            return data.split(",", 1)[1] if data.startswith("data:image/") else data
        return base64.b64encode(data).decode("ascii")

    def normalize_coordinates(self, x: int, y: int, *, source_width: int = 1000, source_height: int = 1000) -> tuple[int, int]:
        width, height = self.get_dimensions()
        return round(x * width / source_width), round(y * height / source_height)

    def click(self, x: int, y: int, button: str = "left") -> None:
        self.page.mouse.click(x, y, button=button, click_count=1)
        self._cursor = (int(x), int(y))

    def double_click(self, x: int, y: int) -> None:
        self.page.mouse.click(x, y, button="left", click_count=2)
        self._cursor = (int(x), int(y))

    def type(self, text: str) -> None:
        self.page.keyboard.type(text)

    def keypress(self, keys: list[str]) -> None:
        mapped = [KEY_MAP.get(key.lower(), key.upper() if len(key) == 1 else key) for key in keys]
        self.page.keyboard.press("+".join(mapped))

    def scroll(self, x: int, y: int, scroll_x: int, scroll_y: int) -> None:
        self.page.mouse.move(x, y)
        self.page.mouse.wheel(scroll_x, scroll_y)
        self._cursor = (int(x), int(y))

    def move(self, x: int, y: int) -> None:
        self.page.mouse.move(x, y)
        self._cursor = (int(x), int(y))

    def drag(self, path: list[dict[str, int]]) -> None:
        if not path:
            return
        first, *rest = path
        self.page.mouse.move(first["x"], first["y"])
        self.page.mouse.down(button="left")
        for point in rest:
            self.page.mouse.move(point["x"], point["y"])
        self.page.mouse.up(button="left")
        last = path[-1]
        self._cursor = (int(last["x"]), int(last["y"]))

    def wait(self, ms: int = 1000) -> None:
        self.page.wait_for_timeout(ms)

    def get_current_url(self) -> str:
        return str(getattr(self.page, "url", ""))

    def _evaluate_number(self, script: str, default: int | float) -> int | float:
        evaluate = getattr(self.page, "evaluate", None)
        if not callable(evaluate):
            return default
        try:
            value = evaluate(script)
        except Exception:
            return default
        return value if isinstance(value, int | float) else default
