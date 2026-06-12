import base64
import importlib.util


def computer_class():
    assert importlib.util.find_spec("app.computer.playwright") is not None
    from app.computer.playwright import PlaywrightComputer

    return PlaywrightComputer


class FakeMouse:
    def __init__(self):
        self.calls = []

    def click(self, x, y, button="left", click_count=1):
        self.calls.append(("click", x, y, button, click_count))

    def move(self, x, y):
        self.calls.append(("move", x, y))

    def wheel(self, delta_x, delta_y):
        self.calls.append(("wheel", delta_x, delta_y))

    def down(self, button="left"):
        self.calls.append(("down", button))

    def up(self, button="left"):
        self.calls.append(("up", button))


class FakeKeyboard:
    def __init__(self):
        self.calls = []

    def type(self, text):
        self.calls.append(("type", text))

    def press(self, key):
        self.calls.append(("press", key))


class FakePage:
    def __init__(self):
        self.mouse = FakeMouse()
        self.keyboard = FakeKeyboard()
        self.viewport_size = {"width": 1280, "height": 800}
        self.url = "https://example.test/task"
        self.waits = []
        self.scroll_x = 25
        self.scroll_y = 180
        self.device_scale_factor = 1.5
        self.screenshot_calls = []

    def screenshot(self, full_page=True):
        self.screenshot_calls.append(full_page)
        return b"png-bytes"

    def wait_for_timeout(self, ms):
        self.waits.append(ms)

    def evaluate(self, script):
        if "scrollX" in script:
            return self.scroll_x
        if "scrollY" in script:
            return self.scroll_y
        if "devicePixelRatio" in script:
            return self.device_scale_factor
        return None


def test_playwright_computer_exposes_screenshot_and_basic_actions():
    page = FakePage()
    computer = computer_class()(page)

    assert computer.get_environment() == "browser"
    assert computer.get_dimensions() == (1280, 800)
    assert base64.b64decode(computer.screenshot()) == b"png-bytes"

    computer.click(10, 20)
    computer.double_click(30, 40)
    computer.type("hello")
    computer.keypress(["ctrl", "a"])
    computer.scroll(50, 60, 0, 120)
    computer.move(70, 80)
    computer.wait(250)

    assert page.mouse.calls == [
        ("click", 10, 20, "left", 1),
        ("click", 30, 40, "left", 2),
        ("move", 50, 60),
        ("wheel", 0, 120),
        ("move", 70, 80),
    ]
    assert page.keyboard.calls == [("type", "hello"), ("press", "Control+A")]
    assert page.waits == [250]


def test_playwright_computer_supports_drag_and_normalized_coordinates():
    page = FakePage()
    computer = computer_class()(page)

    assert computer.normalize_coordinates(500, 250, source_width=1000, source_height=1000) == (640, 200)

    computer.drag([{"x": 100, "y": 200}, {"x": 300, "y": 400}, {"x": 500, "y": 600}])

    assert page.mouse.calls == [
        ("move", 100, 200),
        ("down", "left"),
        ("move", 300, 400),
        ("move", 500, 600),
        ("up", "left"),
    ]


def test_playwright_computer_exposes_screenshot_capture_metadata():
    page = FakePage()
    computer = computer_class()(page)

    metadata = computer.get_capture_metadata(full_page=True)

    assert metadata == {
        "viewport": {"width": 1280, "height": 800},
        "screenshot": {
            "fullPage": True,
            "scrollX": 25,
            "scrollY": 180,
            "deviceScaleFactor": 1.5,
        },
        "cursor": {"coordinateBasis": "viewport", "visible": False},
    }


def test_playwright_computer_captures_viewport_screenshots_by_default():
    page = FakePage()
    computer = computer_class()(page)

    computer.screenshot()

    assert page.screenshot_calls == [False]
    assert computer.get_capture_metadata()["screenshot"]["fullPage"] is False


def test_playwright_computer_tracks_cursor_position_across_pointer_actions():
    page = FakePage()
    computer = computer_class()(page)

    assert computer.get_cursor_position() is None
    assert computer.get_capture_metadata()["cursor"] == {"coordinateBasis": "viewport", "visible": False}

    computer.click(10, 20)
    assert computer.get_cursor_position() == (10, 20)

    computer.double_click(30, 40)
    assert computer.get_cursor_position() == (30, 40)

    computer.scroll(50, 60, 0, 120)
    assert computer.get_cursor_position() == (50, 60)

    computer.move(70, 80)
    assert computer.get_cursor_position() == (70, 80)

    computer.drag([{"x": 100, "y": 200}, {"x": 300, "y": 400}])
    assert computer.get_cursor_position() == (300, 400)

    # Keyboard and wait actions keep the last pointer position.
    computer.type("hello")
    computer.keypress(["ctrl", "a"])
    computer.wait(10)
    assert computer.get_cursor_position() == (300, 400)
    assert computer.get_capture_metadata()["cursor"] == {
        "coordinateBasis": "viewport",
        "x": 300,
        "y": 400,
        "visible": True,
    }
