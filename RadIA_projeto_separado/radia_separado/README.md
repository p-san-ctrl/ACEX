# RadIA - Projeto separado

O projeto original foi separado em arquivos para facilitar a organização:

```text
radia_separado/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── script.js
└── README.md
```

## Como executar

1. Mantenha a estrutura de pastas exatamente como está.
2. Abra `index.html` no navegador.
3. O projeto utiliza algumas bibliotecas por CDN:
   - Tailwind CSS
   - Chart.js
   - Font Awesome
   - Google Fonts

Por isso, é necessário estar conectado à internet para carregar essas dependências.

## Organização

- `index.html`: estrutura visual e componentes da interface.
- `css/style.css`: estilos CSS específicos do projeto.
- `js/script.js`: toda a lógica JavaScript.
- `localStorage`: utilizado pelo protótipo para guardar exames e logs no navegador.

## Observação

A "IA" do projeto é uma simulação de protótipo: o processamento possui uma barra de progresso simulada e seleciona um laudo aleatoriamente. Não existe, neste código, uma API real de diagnóstico por inteligência artificial.
