// Bez konzolového okna v release sestavení na Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    arc_companion_lib::run()
}
