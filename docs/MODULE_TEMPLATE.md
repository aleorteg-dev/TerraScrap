# Módulo `<id> – <nombre>`

> Plantilla para cada módulo. Mantener esta estructura idéntica en todos los módulos del proyecto.
> **La IA, al iterar, solo carga `PROJECT.md` + este doc.**

## 1. Propósito
Una frase. ¿Qué responsabilidad tiene este módulo y qué no?

## 2. Contrato público
Lo que exporta (funciones / clases / tipos / endpoints) con firmas y significado.
Si el contrato cambia, **se actualiza esta sección antes de tocar código**.

### 2.1. Tipos / DTOs
### 2.2. Funciones / API

## 3. Dependencias
- **Otros módulos**: lista, referenciando solo sus contratos públicos.
- **Librerías externas**: con versión mínima.
- **Variables de entorno**: si aplica.

## 4. No objetivos
Lo que explícitamente no hace este módulo, para evitar scope creep.

## 5. Especificación de comportamiento (SDD)
Descripción de casos observables en lenguaje natural. Cada caso se transforma luego en un test.

- **SP-01**: dado ..., cuando ..., entonces ...
- **SP-02**: ...

## 6. Plan de tests (TDD)
Lista de los tests que se escriben **antes** de implementar. Orden sugerido.

- [ ] `T-01` test_...
- [ ] `T-02` test_...
- [ ] `T-03` test_...

## 7. Notas de implementación
Pistas, algoritmos, referencias a formato. No es el código, es el "cómo sin el qué".

## 8. Performance / complejidad (si aplica)
Complejidad esperada, presupuesto de memoria, benchmarks objetivo.

## 9. Errores y casos borde
Lista tipada de errores/excepciones que este módulo puede lanzar y bajo qué condiciones.

## 10. Estado
- **Versión del contrato**: v0
- **Último cierre**: —
- **Iteración actual**: —
- **Deuda / follow-ups**: —