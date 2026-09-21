# Relatório de testes: jorginho-e-cia com Google Calendar desconectado

Empresa testada: **jorginho-e-cia (demo)**, pelo chat público em produção (www.staffra.io), em 20/09/2026.
Rodada extra, depois que você desconectou o Google Calendar. Só a Ana. Foram 5 cenários (17 mensagens) mais um fluxo manual de agendamento. Os testes da rodada anterior (com o calendário na situação em que estava) estão em `relatorio-teste-malu-ana.md`.

As notas são minha avaliação, com base nas regras do `prompt.ts`; o gosto final é seu. Testei só o chat da web (o motor é o mesmo do WhatsApp e do Instagram).

## O que muda com o calendário desconectado

**1. A Ana vaza jargão interno para o cliente (alta).** Ela diz "o calendário ao vivo não pôde ser consultado", "a agenda ao vivo não pôde ser confirmada", "o calendário ao vivo não pôde ser confirmado". Isso quebra a regra de nunca falar de tecnologia e expõe ao cliente uma falha de configuração do lojista. Além disso ela só avisa em algumas respostas (por exemplo, não avisou no primeiro turno sobre amanhã), então a mensagem é inconsistente.
Sugestão: ela pode trabalhar com o expediente e os agendamentos internos sem comentar o calendário, e o aviso ao lojista fica no painel (o ícone e o alerta de "Google Calendar não conectado" já existem).

**2. Avisa que não garante o horário e depois confirma sem ressalva (alta).** Marquei Oftalmo amanhã às 10h20. Primeiro ela disse "não consigo garantir a disponibilidade neste momento. Posso deixar você agendado?". Quando eu confirmei, respondeu "Consulta de Oftalmo confirmada para amanhã, às 10h20", sem ressalva nenhuma. O cliente recebe uma confirmação firme com risco de conflito com compromissos que só existem no Google Calendar do lojista.

**3. Continua oferecendo e marcando horários (média, decisão sua).** Sem calendário ela faz o que fazia, só com o expediente e os agendamentos internos. O conflito interno continua funcionando: um segundo cliente pediu 10h20 e ela recusou, oferecendo 9h40, 11h e 11h40. Mas qualquer coisa marcada só no Google Calendar não é vista. Se preferir bloquear novos agendamentos quando o calendário cair, isso é uma decisão de produto.

**4. Feriados e horizonte (média).** Ofereceu horários em 25/12 e 1º/jan (o sistema não conhece feriados, só o expediente semanal, a menos que você cadastre folgas) e em março de 2027, seis meses à frente. Já tinha aparecido o limite de antecedência no relatório anterior.

**5. "Vou verificar" sem verificar (baixa).** Em "tem horário às 8h amanhã?" ela respondeu "É para a consulta de Oftalmo? Vou verificar…" e parou, sem dar a resposta no mesmo turno.

**6. Não sabe dizer sobre o Google Calendar (positivo).** Para "vocês sincronizam com o Google Calendar?" ou "manda um convite" ela disse que não tem a informação, sem afirmar nada que não possa cumprir.

## Fluxo manual de agendamento, com o calendário desconectado

| Passo | Resultado |
|---|---|
| Marcar amanhã às 10h20 | Avisa que não garante a disponibilidade, pede confirmação e depois confirma normalmente. |
| Segundo cliente pedindo o mesmo horário | Recusa e oferece 9h40, 11h e 11h40 (com o aviso do calendário). |
| Remarcar para quarta às 9h | Remarcou sem problema. |
| Listar agendamentos | Mostrou o agendamento correto. |
| Cancelar | Cancelou e a listagem ficou vazia. |

## Efeitos dos testes
O agendamento de teste foi **cancelado** (confirmei: "não encontrei nenhum agendamento futuro"). Ficaram cerca de 8 conversas de teste no histórico e o cliente "TESTE Claude".

## Nota por cenário

| Cenário | Nota | Comentário |
|---|---|---|
| JC Datas especiais | ⚠️ | Oferece 25/12 e 1º/jan (sem feriados) e março de 2027; avisa do 'calendário ao vivo'. |
| JC Disponibilidade | ⚠️ | Pergunta desnecessária no primeiro turno; avisa 'calendário ao vivo não pôde ser consultado'. |
| JC Duração e intervalos | ✅ | Duração correta; diz que não tem a informação de intervalo. |
| JC Limites do expediente | ⚠️ | Limites certos (17h e 16h50 viram 16h20), mas em 'tem horário às 8h?' promete verificar e não responde. |
| JC Sobre calendário e agenda | ✅ | Não afirma que sincroniza nem que manda convite; honesta. |

## Anexo: conversas completas

### JC Datas especiais  (ana)

**Cliente:** Tem horário no dia 25 de dezembro?

**Ana:** Tenho horários para Oftalmo no dia 25 de dezembro, sexta-feira 😊 Como o calendário ao vivo não pôde ser confirmado, não consigo garantir a disponibilidade neste momento, mas os horários indicados são:

9h
10h20
13h

Qual você prefere? Para agendar, também vou precisar do seu nome completo e e-mail.

**Cliente:** Tem horário no dia 1º de janeiro?

**Ana:** Tenho horários indicados para Oftalmo no dia 1º de janeiro, sexta-feira 😊 O calendário ao vivo não pôde ser confirmado, então não consigo garantir a disponibilidade, mas há opções às 9h, 10h20 e 13h. Qual horário você prefere? Para agendar, preciso também do seu nome completo e e-mail.

**Cliente:** Tem horário daqui a 6 meses?

**Ana:** Sim 😊 Conferi a semana próxima de seis meses, em torno de 20 de março de 2027. Os dias 20 e 21 caem no fim de semana e não há atendimento, mas encontrei horários na quinta, dia 18, e na sexta, dia 19. Algumas opções são 9h, 10h20 e 13h.

O calendário ao vivo não pôde ser confirmado, então não consigo garantir a disponibilidade ainda. Qual dia e horário você prefere? Para agendar, preciso do seu nome completo e e-mail.


### JC Disponibilidade  (ana)

**Cliente:** Quais horários vocês têm livres amanhã?

**Ana:** Claro 😊 É para a consulta de Oftalmo? Amanhã é segunda-feira, 21 de setembro. Confirmando o serviço, verifico os horários disponíveis para você.

**Cliente:** E na quarta-feira?

**Ana:** Na quarta-feira, 23 de setembro, para Oftalmo, tenho estes horários disponíveis: 9h, 9h40, 10h20, 11h, 11h40, 12h20, 13h, 13h40, 14h20, 15h, 15h40 e 16h20 😊

O calendário ao vivo não pôde ser consultado, então não consigo garantir a disponibilidade definitiva neste momento. Qual horário você prefere? Para agendar, também vou precisar do seu nome completo e e-mail.

**Cliente:** Tem horário hoje?

**Ana:** Hoje, domingo, 20 de setembro, não há atendimento — o consultório não abre aos domingos. Posso verificar um horário para segunda-feira ou quarta-feira, quando você prefere?


### JC Duração e intervalos  (ana)

**Cliente:** Quanto tempo dura a consulta?

**Ana:** A consulta de Oftalmo dura 30 minutos 😊

**Cliente:** Tem intervalo entre as consultas?

**Ana:** Não encontrei essa informação disponível. Quer que eu peça para alguém do time confirmar para você?

**Cliente:** Posso marcar duas consultas seguidas, uma para mim e outra para minha esposa?

**Ana:** Posso verificar dois horários consecutivos para vocês 😊 Para qual dia ou período vocês gostariam de marcar? Faremos uma reserva por vez.


### JC Limites do expediente  (ana)

**Cliente:** Tem horário às 8h amanhã?

**Ana:** É para a consulta de Oftalmo? Vou verificar se há horário amanhã, segunda-feira, às 8h 😊

**Cliente:** Tem horário às 17h amanhã?

**Ana:** Às 17h não, mas tenho às 16h20 amanhã, segunda-feira. A agenda ao vivo não pôde ser confirmada, então esse horário ainda precisa ser validado. Quer marcar? Se sim, me envie seu nome completo e e-mail 😊

**Cliente:** Tem horário às 16h50 amanhã?

**Ana:** Às 16h50 não tenho horário disponível amanhã. O mais próximo é às 16h20. Quer marcar esse horário? 😊

**Cliente:** Tem horário às 12h30 amanhã?

**Ana:** Às 12h30 não tenho horário disponível amanhã. O mais próximo é às 12h20. Quer marcar? 😊

**Cliente:** Tem horário no sábado?

**Ana:** Não abrimos no sábado, dia 26 de setembro. Posso verificar um horário na sexta ou na segunda-feira, se preferir 😊


### JC Sobre calendário e agenda  (ana)

**Cliente:** Vocês sincronizam com o Google Calendar?

**Ana:** Não tenho essa informação disponível no momento. Posso te ajudar a verificar horários ou agendar um serviço 😊

**Cliente:** Vocês conseguem me mandar um convite de calendário?

**Ana:** Não consigo confirmar o envio de convites de calendário por aqui. Posso ajudar a verificar ou agendar um horário, e o time pode orientar sobre o convite.

**Cliente:** Tem alguma agenda online que eu possa consultar?

**Ana:** Não tenho um link de agenda online disponível para te passar. Posso consultar os horários por aqui e ajudar você a marcar um atendimento 😊

