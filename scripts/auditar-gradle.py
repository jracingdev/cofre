#!/usr/bin/env python3
"""Consulta o OSV pelas dependências diretas do aplicativo Android."""

import json
import sys
import urllib.request

PACOTES = [
    ("Maven", "com.goterl:lazysodium-android", "5.1.0"),
    ("Maven", "net.java.dev.jna:jna", "5.14.0"),
    ("Maven", "org.json:json", "20260719"),
    ("Maven", "androidx.activity:activity-compose", "1.9.3"),
    ("Maven", "androidx.lifecycle:lifecycle-runtime-ktx", "2.8.7"),
    ("Maven", "androidx.lifecycle:lifecycle-viewmodel-compose", "2.8.7"),
    ("Maven", "androidx.biometric:biometric", "1.1.0"),
    ("Maven", "androidx.fragment:fragment-ktx", "1.8.5"),
    ("Maven", "com.squareup.okhttp3:okhttp", "4.12.0"),
    ("Maven", "org.jetbrains.kotlinx:kotlinx-coroutines-android", "1.9.0"),
]


def consultar(ecossistema: str, nome: str, versao: str) -> list[str]:
    corpo = json.dumps({
        "package": {"name": nome, "ecosystem": ecossistema},
        "version": versao,
    }).encode()
    pedido = urllib.request.Request(
        "https://api.osv.dev/v1/query",
        data=corpo,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(pedido, timeout=30) as resposta:
        dados = json.load(resposta)
    return [item.get("id", "?") for item in dados.get("vulns", [])]


def main() -> int:
    falhas = 0
    for ecossistema, nome, versao in PACOTES:
        try:
            avisos = consultar(ecossistema, nome, versao)
        except Exception as erro:
            print(f"falha ao consultar {nome}: {erro}", file=sys.stderr)
            return 1
        if avisos:
            falhas += 1
            print(f"{nome} {versao}: {', '.join(avisos)}")
        else:
            print(f"{nome} {versao}: limpo")
    return 1 if falhas else 0


if __name__ == "__main__":
    raise SystemExit(main())
