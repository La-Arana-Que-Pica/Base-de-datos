from __future__ import annotations

import argparse
import os
import threading
import traceback
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

IMPORT_ERROR: Exception | None = None

try:
    import pandas as pd

    from src.config import load_config, project_path
    from src.data import load_players, load_players_from_option_file, split_by_position
    from src.exporter import export_corrected_files
    from src.io_utils import load_model_bundle, prepare_output_dir, save_excel_csv, save_training_outputs
    from src.metrics import prediction_frame
    from src.models import train_for_position
except Exception as exc:  # La interfaz muestra el error de dependencias de forma amable.
    IMPORT_ERROR = exc


class FormulaMediasApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Formula Medias PES 2018")
        self.geometry("920x640")
        self.minsize(820, 560)

        if IMPORT_ERROR is not None:
            self._build_dependency_error_ui()
            return

        self.config_data = load_config("config.json")
        self.players_path = tk.StringVar(value=str(project_path(self.config_data, self.config_data["input_csv"])))
        self.corrections_path = tk.StringVar(value=str(project_path(self.config_data, self.config_data["corrections_csv"])))
        self.formulas_path = tk.StringVar(value=str(project_path(self.config_data, self.config_data["formulas_json"])))
        self.predict_path = tk.StringVar(value="")
        self.predict_output_name = tk.StringVar(value="predicciones_nuevos_jugadores.csv")
        self.ss_like_cf = tk.BooleanVar(value=False)
        self.overwrite_all_players = tk.BooleanVar(value=False)
        self.status_text = tk.StringVar(value="Listo")

        self._build_ui()

    def _build_dependency_error_ui(self) -> None:
        frame = ttk.Frame(self, padding=24)
        frame.pack(fill="both", expand=True)
        message = (
            "Faltan dependencias para ejecutar Formula Medias.\n\n"
            "Instalalas desde esta carpeta con:\n\n"
            "pip install -r requirements.txt\n\n"
            f"Detalle tecnico: {IMPORT_ERROR}"
        )
        ttk.Label(frame, text="Formula Medias PES 2018", font=("Segoe UI", 18, "bold")).pack(anchor="w")
        ttk.Label(frame, text=message, justify="left", padding=(0, 18, 0, 0)).pack(anchor="w")

    def _build_ui(self) -> None:
        root = ttk.Frame(self, padding=16)
        root.pack(fill="both", expand=True)
        root.columnconfigure(0, weight=1)
        root.rowconfigure(4, weight=1)

        title = ttk.Label(root, text="Formula Medias PES 2018", font=("Segoe UI", 18, "bold"))
        title.grid(row=0, column=0, sticky="w", pady=(0, 14))

        train_box = ttk.LabelFrame(root, text="Entrenamiento con Option File", padding=12)
        train_box.grid(row=1, column=0, sticky="ew", pady=(0, 12))
        train_box.columnconfigure(1, weight=1)

        ttk.Label(train_box, text="Jugadores").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=4)
        ttk.Entry(train_box, textvariable=self.players_path).grid(row=0, column=1, sticky="ew", pady=4)
        ttk.Button(train_box, text="Buscar", command=self.choose_players_file).grid(row=0, column=2, padx=(8, 0), pady=4)

        ttk.Label(train_box, text="Medias corregidas").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=4)
        ttk.Entry(train_box, textvariable=self.corrections_path).grid(row=1, column=1, sticky="ew", pady=4)
        ttk.Button(train_box, text="Buscar", command=self.choose_corrections_file).grid(row=1, column=2, padx=(8, 0), pady=4)

        ttk.Label(train_box, text="Formulas JSON").grid(row=2, column=0, sticky="w", padx=(0, 8), pady=4)
        ttk.Entry(train_box, textvariable=self.formulas_path).grid(row=2, column=1, sticky="ew", pady=4)
        ttk.Button(train_box, text="Buscar", command=self.choose_formulas_file).grid(row=2, column=2, padx=(8, 0), pady=4)

        actions = ttk.Frame(train_box)
        actions.grid(row=3, column=0, columnspan=3, sticky="ew", pady=(10, 0))
        ttk.Button(actions, text="Entrenar formulas", command=self.start_training).pack(side="left")
        ttk.Button(actions, text="Abrir output", command=self.open_output).pack(side="left", padx=(8, 0))

        predict_box = ttk.LabelFrame(root, text="Prediccion con modelos entrenados", padding=12)
        predict_box.grid(row=2, column=0, sticky="ew", pady=(0, 12))
        predict_box.columnconfigure(1, weight=1)

        ttk.Label(predict_box, text="CSV a predecir").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=4)
        ttk.Entry(predict_box, textvariable=self.predict_path).grid(row=0, column=1, sticky="ew", pady=4)
        ttk.Button(predict_box, text="Buscar", command=self.choose_predict_file).grid(row=0, column=2, padx=(8, 0), pady=4)

        ttk.Label(predict_box, text="Archivo de salida").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=4)
        ttk.Entry(predict_box, textvariable=self.predict_output_name).grid(row=1, column=1, sticky="ew", pady=4)
        ttk.Button(predict_box, text="Generar predicciones", command=self.start_prediction).grid(
            row=1, column=2, padx=(8, 0), pady=4
        )

        export_box = ttk.LabelFrame(root, text="Exportar archivos corregidos", padding=12)
        export_box.grid(row=3, column=0, sticky="ew", pady=(0, 12))
        export_box.columnconfigure(0, weight=1)

        ttk.Checkbutton(
            export_box,
            text="Usar modelo CF/DC para SS",
            variable=self.ss_like_cf,
        ).grid(row=0, column=0, sticky="w")
        ttk.Checkbutton(
            export_box,
            text="Sobrescribir All players exported.csv con backup",
            variable=self.overwrite_all_players,
        ).grid(row=1, column=0, sticky="w", pady=(6, 0))
        ttk.Button(export_box, text="Crear CSV corregidos", command=self.start_export).grid(
            row=0, column=1, rowspan=2, sticky="e", padx=(8, 0)
        )

        log_box = ttk.LabelFrame(root, text="Log", padding=8)
        log_box.grid(row=4, column=0, sticky="nsew")
        log_box.rowconfigure(0, weight=1)
        log_box.columnconfigure(0, weight=1)

        self.log = tk.Text(log_box, wrap="word", height=16)
        self.log.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(log_box, orient="vertical", command=self.log.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.log.configure(yscrollcommand=scrollbar.set)

        footer = ttk.Frame(root)
        footer.grid(row=5, column=0, sticky="ew", pady=(10, 0))
        footer.columnconfigure(0, weight=1)
        ttk.Label(footer, textvariable=self.status_text).grid(row=0, column=0, sticky="w")
        self.progress = ttk.Progressbar(footer, mode="indeterminate", length=180)
        self.progress.grid(row=0, column=1, sticky="e")

    def choose_players_file(self) -> None:
        path = filedialog.askopenfilename(title="Elegir All players exported.csv", filetypes=[("CSV", "*.csv")])
        if path:
            self.players_path.set(path)

    def choose_corrections_file(self) -> None:
        path = filedialog.askopenfilename(title="Elegir medias_corregidas.csv", filetypes=[("CSV", "*.csv")])
        if path:
            self.corrections_path.set(path)

    def choose_formulas_file(self) -> None:
        path = filedialog.askopenfilename(title="Elegir formulas_por_posicion.json", filetypes=[("JSON", "*.json")])
        if path:
            self.formulas_path.set(path)

    def choose_predict_file(self) -> None:
        path = filedialog.askopenfilename(title="Elegir CSV a predecir", filetypes=[("CSV", "*.csv")])
        if path:
            self.predict_path.set(path)

    def log_line(self, text: str) -> None:
        self.log.insert("end", text + "\n")
        self.log.see("end")

    def thread_log(self, text: str) -> None:
        self.after(0, lambda: self.log_line(text))

    def set_busy(self, busy: bool, status: str) -> None:
        self.status_text.set(status)
        if busy:
            self.progress.start(12)
        else:
            self.progress.stop()

    def start_training(self) -> None:
        self.set_busy(True, "Entrenando...")
        self.log_line("Iniciando entrenamiento por posicion.")
        thread = threading.Thread(target=self._train_worker, daemon=True)
        thread.start()

    def _train_worker(self) -> None:
        try:
            players, feature_columns = load_players_from_option_file(
                self.config_data,
                self.players_path.get(),
                self.corrections_path.get(),
            )
            players_by_position = split_by_position(players)
            self.thread_log(f"Jugadores con media corregida encontrados: {len(players)}")
            self.thread_log(f"Estadisticas usadas: {', '.join(feature_columns)}")

            trained_models = []
            for position, df_position in players_by_position.items():
                self.thread_log(f"Entrenando {position}: {len(df_position)} jugadores")
                trained_models.append(train_for_position(position, df_position, feature_columns, self.config_data))

            save_training_outputs(self.config_data, trained_models, players_by_position)
            output_dir = prepare_output_dir(self.config_data)
            self.after(0, lambda: self.set_busy(False, "Entrenamiento terminado"))
            self.thread_log(f"Listo. Resultados guardados en: {output_dir}")
            self.after(0, lambda: messagebox.showinfo("Formula Medias", "Entrenamiento terminado."))
        except Exception as exc:
            details = traceback.format_exc()
            self.after(0, lambda: self.set_busy(False, "Error en entrenamiento"))
            self.thread_log(details)
            self.after(0, lambda: messagebox.showerror("Error", str(exc)))

    def start_prediction(self) -> None:
        if not self.predict_path.get():
            messagebox.showwarning("Falta CSV", "Elegí un CSV para predecir.")
            return
        self.set_busy(True, "Generando predicciones...")
        self.log_line("Generando predicciones.")
        thread = threading.Thread(target=self._predict_worker, daemon=True)
        thread.start()

    def _predict_worker(self) -> None:
        try:
            players, _ = load_players(self.config_data, self.predict_path.get(), require_target=False)
            outputs = []
            for position, df_position in players.groupby("position", sort=True):
                self.thread_log(f"Prediciendo {position}: {len(df_position)} jugadores")
                bundle = load_model_bundle(self.config_data, position)
                decimal_predictions = bundle["model"].predict(df_position[bundle["feature_columns"]])
                outputs.append(prediction_frame(df_position, decimal_predictions))

            output_dir = prepare_output_dir(self.config_data)
            output_path = output_dir / self.predict_output_name.get()
            save_excel_csv(pd.concat(outputs, ignore_index=True), output_path, self.config_data)
            self.after(0, lambda: self.set_busy(False, "Prediccion terminada"))
            self.thread_log(f"Predicciones guardadas en: {output_path}")
            self.after(0, lambda: messagebox.showinfo("Formula Medias", "Predicciones generadas."))
        except Exception as exc:
            details = traceback.format_exc()
            self.after(0, lambda: self.set_busy(False, "Error en prediccion"))
            self.thread_log(details)
            self.after(0, lambda: messagebox.showerror("Error", str(exc)))

    def start_export(self) -> None:
        if self.overwrite_all_players.get():
            confirmed = messagebox.askyesno(
                "Confirmar sobrescritura",
                "Se va a sobrescribir el archivo All players exported.csv elegido. "
                "Antes se creara un backup automatico. ¿Continuar?",
            )
            if not confirmed:
                return
        self.set_busy(True, "Exportando archivos...")
        self.log_line("Creando CSV corregidos con modelos entrenados.")
        thread = threading.Thread(target=self._export_worker, daemon=True)
        thread.start()

    def _export_worker(self) -> None:
        try:
            result = export_corrected_files(
                self.config_data,
                players_csv=self.players_path.get(),
                corrections_csv=self.corrections_path.get(),
                formulas_json=self.formulas_path.get(),
                use_ss_like_cf=self.ss_like_cf.get(),
                overwrite_all_players=self.overwrite_all_players.get(),
                use_saved_formulas=True,
            )
            self.after(0, lambda: self.set_busy(False, "Exportacion terminada"))
            self.thread_log(f"Predicciones: {result.predictions_path}")
            self.thread_log(f"Formulas usadas: {result.formulas_path}")
            if result.medias_corregidas_path:
                self.thread_log(f"medias_corregidas nuevo: {result.medias_corregidas_path}")
            self.thread_log(f"All players nuevo: {result.all_players_path}")
            if result.overwritten_all_players_path:
                self.thread_log(f"All players sobrescrito: {result.overwritten_all_players_path}")
                self.thread_log(f"Backup: {result.backup_path}")
            self.thread_log(f"Jugadores predichos: {result.predicted_players}/{result.total_players}")
            self.after(0, lambda: messagebox.showinfo("Formula Medias", "CSV corregidos generados."))
        except Exception as exc:
            details = traceback.format_exc()
            self.after(0, lambda: self.set_busy(False, "Error en exportacion"))
            self.thread_log(details)
            self.after(0, lambda: messagebox.showerror("Error", str(exc)))

    def open_output(self) -> None:
        output_dir = prepare_output_dir(self.config_data)
        os.startfile(Path(output_dir))


def main() -> None:
    parser = argparse.ArgumentParser(description="Interfaz grafica para Formula Medias.")
    parser.parse_args()
    app = FormulaMediasApp()
    app.mainloop()


if __name__ == "__main__":
    main()
