# RadIA — análise preliminar de radiografias com IA

O RadIA integra o frontend existente ao Supabase e a um detector especializado em radiografias de trauma de **punho pediátrico**. A IA é apoio à decisão: os achados são preliminares, podem conter falsos positivos e falsos negativos e nunca substituem o laudo do radiologista.

## Modelo selecionado

- **Modelo:** YOLOv8 treinado no GRAZPEDWRI-DX, publicado por Rui-Yang Ju e Weiming Cai.
- **Código e pesos:** `RuiyangJu/Bone_Fracture_Detection_YOLOv8`, commit `9f0a38c`.
- **Checksum dos pesos:** `301abc1774c28dd7c5adbcf1e8a79ed6771273615238b62dd179b622292b3a81`.
- **Capacidade real:** detecção com bounding boxes, classe e confiança para nove categorias, incluindo `fracture`.
- **Escopo anatômico:** radiografias de trauma de punho pediátrico. Não usar para tórax, coluna, quadril, outros membros ou adultos como se houvesse validação equivalente.
- **Situação regulatória:** modelo acadêmico, sem validação clínica/regulatória para diagnóstico autônomo.

O modelo foi preferido a uma API de visão genérica porque foi treinado especificamente com radiografias e produz localização. Serviços comerciais como BoneView/Rayvolve exigem contratação e acordo de tratamento de dados; não há credenciais comerciais disponíveis neste projeto. O repositório do estudo está sob licença MIT. O pacote Ultralytics usa AGPL-3.0 ou licença empresarial, que precisa ser avaliada para a forma de distribuição escolhida.

## Arquitetura

1. O radiologista autenticado seleciona PNG/JPEG (até 10 MB) e confirma os metadados.
2. O frontend valida o arquivo, cria `exames`, envia a imagem ao bucket privado `medical-images` e registra `arquivos_exame`.
3. A Edge Function `analisar-exame` valida novamente a sessão e a responsabilidade pelo exame.
4. A função impede processamento duplicado por arquivo, baixa a imagem com credencial de backend e a envia sem CPF/nome ao serviço de inferência.
5. O serviço executa os pesos verificados e retorna bounding boxes normalizadas.
6. A função grava `analises_ia`, `achados_ia` e `registros_auditoria`.
7. O frontend exibe a imagem original, as caixas proporcionais, confiança, modelo e status. As caixas podem ser ocultadas.
8. A Edge Function `revisar-exame` registra a decisão profissional em `laudos`, atualiza `exames` e audita o evento.

Imagens, fila e laudos não são gravados em `localStorage`: a fila de pacientes, o atendimento e a auditoria usam os serviços autenticados do Supabase. O arquivo `radIA26-10.html` permanece apenas como referência histórica do protótipo visual e funcional.

## Configuração

### 1. Banco e Storage

Aplique `supabase/migrations/20261106013404_add_fracture_ai_workflow.sql`. A migração cria/configura o bucket privado, colunas de rastreabilidade, índice de idempotência e políticas de acesso às imagens.

Se o restante da migração já estiver aplicado e a interface mostrar `Bucket not found`, execute apenas `supabase/configurar_storage.sql` no SQL Editor. O script é idempotente, mantém o bucket privado, limita os arquivos a 10 MB e aceita somente PNG/JPEG.

O arquivo `supabase/schema.sql` é histórico e não corresponde ao banco atual; não o aplique.

O Security Advisor também aponta que `obter_email_login` é uma função `SECURITY DEFINER` acessível antes do login. Ela é necessária ao fluxo legado CPF/CRM → e-mail, mas permite enumeração de identificadores e deve ser substituída por login direto por e-mail ou por um endpoint com rate limit/CAPTCHA antes de uso real. A proteção contra senhas vazadas deve ser ativada no painel do Supabase Auth.

### 2. Serviço de inferência

```bash
cd inference-service
docker build -t radia-fracture-inference .
docker run --rm -p 8080:8080 \
  -e INFERENCE_API_TOKEN='troque-por-um-segredo-forte' \
  radia-fracture-inference
```

Em ambientes com proxy TLS, forneça a CA somente durante o build: `docker build --secret id=proxy_ca,src=/caminho/ca.pem -t radia-fracture-inference .`.

Variáveis opcionais: `CONFIDENCE_THRESHOLD` (padrão `0.25`), `IOU_THRESHOLD` (`0.45`), `IMAGE_SIZE` (`1024`) e `MODEL_PATH` (`/models/best.pt`). CPU funciona, mas GPU reduz a latência. O serviço não persiste as imagens.

### 3. Edge Functions

```bash
supabase secrets set \
  AI_INFERENCE_URL='https://seu-servico-de-inferencia' \
  AI_INFERENCE_TOKEN='o-mesmo-segredo'
supabase functions deploy analisar-exame
supabase functions deploy revisar-exame
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`/`SUPABASE_PUBLISHABLE_KEYS` e `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEYS` são fornecidas pelo Supabase. Nunca coloque chaves secretas no navegador.

## Testes

```bash
cd inference-service
python -m pytest tests
```

Os testes de contrato usam um detector falso identificado como tal; não são inferência clínica. Para testar inferência real, execute o contêiner e envie uma radiografia de punho pediátrico autorizada:

```bash
curl -X POST http://localhost:8080/predict \
  -H 'Content-Type: image/png' \
  -H 'Authorization: Bearer seu-segredo' \
  --data-binary @radiografia.png
```

Não use dados reais identificáveis fora de ambiente autorizado. Antes de produção são obrigatórios validação clínica independente, DPIA/RIPD, contrato com o operador de infraestrutura, política de retenção, monitoramento de viés/desempenho e revisão jurídica/regulatória.

Na validação de desenvolvimento, os pesos oficiais foram carregados e executados de verdade sobre a figura pública de resultados do próprio artigo (`figure_result.jpg`): 123 caixas foram retornadas nas classes `fracture`, `metal` e `text`, em aproximadamente 1,85 s na CPU. A figura é uma montagem e esse número **não** mede acurácia clínica; apenas comprova que o artefato e o contrato de inferência funcionam. Os testes automatizados continuam usando um detector falso explícito para serem determinísticos.

## Limitações atuais

- Apenas PNG/JPEG; DICOM e PDF não são convertidos.
- Apenas punho pediátrico, conforme o conjunto de treinamento.
- O serviço de inferência precisa ser hospedado separadamente; Supabase Edge Functions não executam PyTorch/Ultralytics.
- A qualidade depende de posicionamento, aquisição e domínio semelhantes aos dados de treinamento.
- O projeto não inclui validação prospectiva, certificação regulatória ou SLA clínico.
- Custos dependem da hospedagem do modelo (CPU/GPU), do plano Supabase e do tráfego/armazenamento.
