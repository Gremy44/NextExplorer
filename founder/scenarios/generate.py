"""Illustrations only, EUR throughout. No actual business inputs are inferred."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENGINE = Path.home() / ".codex/skills/founder-cfo/unit_economics.py"
spec = importlib.util.spec_from_file_location("founder_economics", ENGINE)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


def inputs(monthly_units, price=49, support_minutes=20):
    net = price / 1.2  # Illustrative 20% tax reserve, NOT a legal tax determination.
    return {
        "business": "NextExplorer — scénario non validé, EUR",
        "unit": "licence nouvelle",
        "price": net,
        "variable": [
            {"label": "Paiement/change/suppléments estimés, pas un devis", "cost": 4},
            {"label": "Support valorisé 20 EUR/h", "cost": support_minutes / 60 * 20},
            {"label": "Réserve remboursements 5% revenu net", "cost": net * 0.05},
        ],
        "fixed_monthly": [
            {"label": "40 h maintenance/acquisition/gestion valorisées 20 EUR/h", "cost": 800},
            {"label": "Réserve outils/frais non connus, estimation", "cost": 40},
        ],
        "startup": [{"label": "Dépense additionnelle autorisée dans ce scénario", "cost": 0}],
        "days_per_month": 30,
        "plan_per_day": monthly_units[-1] / 30,
        "ramp_per_day": [u / 30 for u in monthly_units],
    }


ramps = {
    "prudent": [0, 0, 2, 3, 5, 5, 8, 8, 10, 10, 12, 12],
    "central": [0, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
    "traction": [0, 0, 10, 20, 35, 50, 70, 90, 110, 130, 150, 170],
}
results = {}
for name, ramp in ramps.items():
    scenario = inputs(ramp)
    (ROOT / (name + "-inputs.json")).write_text(json.dumps(scenario, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result = engine.analyse(scenario)
    assert abs(sum(m["units"] for m in result["months"]) - sum(ramp)) < 1e-6
    assert abs(result["year1_profit"] - (sum(ramp) * result["contribution"] - 12 * result["fixed_monthly"])) < 1e-6
    result["scenario_only"] = True
    result["currency"] = "EUR"
    result["implied_founder_hours_at_plan_month"] = 40 + ramp[-1] / 3
    results[name] = result

results["central-support-5min"] = engine.analyse(inputs(ramps["central"], support_minutes=5))
results["central-price-59"] = engine.analyse(inputs(ramps["central"], price=59))
results["central-price-39"] = engine.analyse(inputs(ramps["central"], price=39))
results["central-volume-minus20"] = engine.analyse(inputs(ramps["central"]), volume=0.8)
fewer_fixed_hours = inputs(ramps["central"])
fewer_fixed_hours["fixed_monthly"][0]["cost"] = 400
results["central-fixed-20h"] = engine.analyse(fewer_fixed_hours)
base = results["central"]
assert abs(base["contribution"] - 28.125) < 1e-6
(ROOT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
for name, r in results.items():
    print(f"{name}: contribution={r['contribution']:.2f} EUR; break-even={r['breakeven_per_day']*30:.2f}/month; year1={r['year1_profit']:.2f} EUR; cash-equivalent={r['cash_needed']:.2f} EUR")
