package app.broquel.cripto

class ErroCripto(val codigo: String, mensagem: String) : RuntimeException(mensagem)
