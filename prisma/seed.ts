import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Очищаем существующие данные
  await prisma.userResponse.deleteMany();
  await prisma.objection.deleteMany();
  await prisma.objectionCategory.deleteMany();
  await prisma.principle.deleteMany();
  await prisma.phrase.deleteMany();

  // Создаем категории
  const categories = [
    { name: "Цена", description: "Возражения, связанные с ценой продукта или услуги" },
    { name: "Доверие", description: "Возражения, связанные с доверием к продавцу или компании" },
    { name: "Срочность", description: "Возражения, связанные со сроками принятия решения" },
    { name: "Функциональность", description: "Возражения, связанные с функционалом продукта" },
    { name: "Потребность", description: "Возражения, связанные с необходимостью продукта" },
  ];

  const createdCategories = await Promise.all(
    categories.map(category =>
      prisma.objectionCategory.create({
        data: category,
      }),
    ),
  );

  // Создаем возражения
  const objections = [
    { text: "Это слишком дорого", category: "Цена", difficulty: 3 },
    { text: "У ваших конкурентов дешевле", category: "Цена", difficulty: 4 },
    { text: "Нет бюджета", category: "Цена", difficulty: 5 },
    { text: "Мне нужно подумать", category: "Срочность", difficulty: 2 },
    { text: "Давайте вернемся к этому позже", category: "Срочность", difficulty: 2 },
    { text: "Мне нужно посоветоваться с коллегами", category: "Срочность", difficulty: 3 },
    { text: "Я не уверен, что вы сможете решить нашу проблему", category: "Доверие", difficulty: 4 },
    { text: "У вас мало опыта в нашей отрасли", category: "Доверие", difficulty: 4 },
    { text: "Мы уже работаем с другим поставщиком", category: "Доверие", difficulty: 5 },
    { text: "Пришлите мне предложение на почту", category: "Срочность", difficulty: 1 },
    { text: "Мы не уверены в качестве вашего продукта", category: "Доверие", difficulty: 4 },
    { text: "У ваших конкурентов есть более выгодное предложение", category: "Цена", difficulty: 4 },
    { text: "Мы не видим, как это решит нашу проблему", category: "Доверие", difficulty: 3 },
    { text: "Ваш продукт сложный в использовании", category: "Функциональность", difficulty: 3 },
    { text: "У нас уже есть аналогичное решение", category: "Потребность", difficulty: 5 },
    { text: "Ваш продукт не поддерживает нужные нам функции", category: "Функциональность", difficulty: 3 },
    { text: "Ваши условия оплаты нас не устраивают", category: "Цена", difficulty: 4 },
    { text: "Наш менеджмент против этого решения", category: "Доверие", difficulty: 5 },
    { text: "Ваш продукт недостаточно инновационный", category: "Функциональность", difficulty: 3 },
    { text: "Ваше решение не подходит под наши процессы", category: "Функциональность", difficulty: 4 },
    { text: "Ваш продукт требует слишком много ресурсов", category: "Функциональность", difficulty: 3 },
    { text: "Наш текущий поставщик нас устраивает", category: "Доверие", difficulty: 5 },
    { text: "Ваше предложение не выгоднее нашего текущего контракта", category: "Цена", difficulty: 4 },
    { text: "Ваш продукт не соответствует нашим стандартам безопасности", category: "Функциональность", difficulty: 5 },
    { text: "Мы боимся технических проблем", category: "Доверие", difficulty: 3 },
    { text: "Мы не готовы к внедрению новых технологий", category: "Потребность", difficulty: 5 },
    { text: "Ваш продукт слишком сложный для наших сотрудников", category: "Функциональность", difficulty: 3 },
    { text: "Мы не видим экономической выгоды от вашего решения", category: "Цена", difficulty: 4 },
    { text: "Ваши кейсы не убеждают нас", category: "Доверие", difficulty: 4 },
    { text: "Ваше предложение не уникально", category: "Функциональность", difficulty: 3 },
    { text: "Ваш продукт не поддерживает нашу интеграцию", category: "Функциональность", difficulty: 5 },
    { text: "Ваш сервис не локализован на наш язык", category: "Функциональность", difficulty: 3 },
    { text: "Мы опасаемся долгосрочных обязательств", category: "Доверие", difficulty: 4 },
    { text: "Мы не хотим зависеть от одного поставщика", category: "Доверие", difficulty: 5 },
    { text: "Ваши отзывы не выглядят убедительно", category: "Доверие", difficulty: 3 },
    { text: "Ваш продукт еще не доказал свою эффективность", category: "Доверие", difficulty: 4 },
    { text: "Мы не видим смысла в переходе на ваш сервис", category: "Потребность", difficulty: 5 },
  ];

  for (const objection of objections) {
    const category = createdCategories.find(c => c.name === objection.category);
    if (category) {
      await prisma.objection.create({
        data: {
          text: objection.text,
          categoryId: category.id,
        },
      });
    }
  }

  console.log("База данных успешно заполнена начальными данными");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
